import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

// Cloudflare Turnstile CAPTCHA, rendered inside a WebView so it works in a native
// Expo app. Supabase enforces the token server-side (Auth → Attack Protection →
// Turnstile with the matching *secret*); the app only supplies the *sitekey*.
//
// Usage: keep one <Captcha ref={ref} /> mounted in the form, then on submit call
// `const token = await ref.current.getToken()`. Tokens are single-use and expire
// after a few minutes, so fetch a fresh one for every auth attempt.

const SITEKEY = process.env.EXPO_PUBLIC_TURNSTILE_SITEKEY;

// ⚠️ DO NOT re-add an origin whitelist / navigation guard here without device testing.
//
// The 2026-09-06 security audit tightened this WebView from `originWhitelist={["*"]}` to a
// pinned list plus an onShouldStartLoadWithRequest guard. It BROKE SIGNUP AND LOGIN on device
// (build 11): the widget never returned a token and getToken() hit its 30s timeout.
//
// Cause: Turnstile doesn't just fetch api.js — it builds the challenge inside nested iframes
// (challenges.cloudflare.com/cdn-cgi/challenge-platform/..., plus about:srcdoc frames), and on
// iOS onShouldStartLoadWithRequest fires for those sub-frame loads too. Refusing any one of
// them kills the widget silently: no error, just a spinner until the timeout.
//
// This was a LOW-severity, defence-in-depth finding on a WebView that renders a static local
// document and receives no user-supplied input — not worth risking the auth path for. Reverted
// to the configuration that demonstrably works. The message handler below still validates what
// comes back, which is the part that actually touches our data.

// Turnstile is configured in "invisible"/managed execution mode: the widget solves
// silently when we call turnstile.execute(), and only shows an interactive
// challenge if Cloudflare deems the client suspicious.
function buildHtml(sitekey: string): string {
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>
<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}#c{display:flex;justify-content:center}</style>
</head><body>
<div id="c"></div>
<script>
  var widgetId = null;
  function post(msg){ if(window.ReactNativeWebView){ window.ReactNativeWebView.postMessage(JSON.stringify(msg)); } }
  function render(){
    if(!window.turnstile){ setTimeout(render, 150); return; }
    widgetId = window.turnstile.render('#c', {
      sitekey: '${sitekey}',
      // Wait for turnstile.execute() (triggered on submit) rather than solving on
      // load, and only paint UI when Cloudflare escalates to an interactive challenge.
      execution: 'execute',
      appearance: 'interaction-only',
      size: 'flexible',
      callback: function(token){ post({ type: 'token', token: token }); },
      'error-callback': function(){ post({ type: 'error' }); },
      'expired-callback': function(){ post({ type: 'expired' }); },
    });
    post({ type: 'ready' });
  }
  function execute(){
    if(widgetId === null){ post({ type: 'error' }); return; }
    try { window.turnstile.reset(widgetId); window.turnstile.execute(widgetId); }
    catch(e){ post({ type: 'error' }); }
  }
  document.addEventListener('message', function(e){ if(e.data === 'execute') execute(); });
  window.addEventListener('message', function(e){ if(e.data === 'execute') execute(); });
  render();
</script>
</body></html>`;
}

export type CaptchaHandle = {
  /** Resolves with a fresh single-use Turnstile token, or rejects on error/timeout. */
  getToken: () => Promise<string>;
};

export const Captcha = forwardRef<CaptchaHandle>(function Captcha(_props, ref) {
  const webRef = useRef<WebView>(null);
  const pending = useRef<{ resolve: (t: string) => void; reject: (e: Error) => void } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ready, setReady] = useState(false);

  const html = useMemo(() => (SITEKEY ? buildHtml(SITEKEY) : ""), []);

  function settleReject(message: string) {
    if (timer.current) clearTimeout(timer.current);
    const p = pending.current;
    pending.current = null;
    p?.reject(new Error(message));
  }

  useImperativeHandle(ref, () => ({
    getToken() {
      return new Promise<string>((resolve, reject) => {
        if (!SITEKEY) {
          reject(new Error("CAPTCHA is not configured. Set EXPO_PUBLIC_TURNSTILE_SITEKEY."));
          return;
        }
        if (pending.current) {
          reject(new Error("A verification is already in progress."));
          return;
        }
        pending.current = { resolve, reject };
        timer.current = setTimeout(() => settleReject("Verification timed out. Please try again."), 30000);
        // Ask the in-WebView widget to run. postMessage is delivered to both the
        // document and window listeners registered above.
        webRef.current?.injectJavaScript("execute(); true;");
      });
    },
  }));

  if (!SITEKEY) return null;

  return (
    <View style={styles.host} pointerEvents={ready ? "auto" : "none"}>
      <WebView
        ref={webRef}
        // See the note at the top of this file — this must stay permissive for Turnstile's
        // nested challenge iframes to load. Do not tighten without device-testing signup+login.
        originWhitelist={["*"]}
        source={{ html, baseUrl: "https://upvital.app" }}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        style={styles.web}
        onMessage={(e) => {
          let msg: any;
          try {
            msg = JSON.parse(e.nativeEvent.data);
          } catch {
            return;
          }
          if (msg.type === "ready") {
            setReady(true);
          } else if (msg.type === "token") {
            // Only resolve on an actual string — never hand a non-string through to the auth
            // call, which would fail confusingly further downstream.
            if (typeof msg.token !== "string" || msg.token.length === 0) {
              settleReject("Verification failed. Please try again.");
              return;
            }
            if (timer.current) clearTimeout(timer.current);
            const p = pending.current;
            pending.current = null;
            p?.resolve(msg.token);
          } else if (msg.type === "expired") {
            settleReject("Verification expired. Please try again.");
          } else if (msg.type === "error") {
            settleReject("Verification failed. Please try again.");
          }
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  // Reserve a small strip. In managed mode the widget is usually invisible; when
  // Cloudflare escalates to an interactive challenge it renders within this space.
  host: { height: 70, marginTop: 4, backgroundColor: "transparent" },
  web: { flex: 1, backgroundColor: "transparent" },
});
