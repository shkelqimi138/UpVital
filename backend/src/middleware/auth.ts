// Express middleware that verifies the Supabase JWT and attaches the authenticated user id to the request
import type { NextFunction, Request, Response } from "express";
import { supabaseAdmin } from "../supabase";
import { jwtSessionId } from "../lib/validate";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      /** The login session behind the token (its `session_id` claim), when present. */
      sessionId?: string | null;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

  if (!token) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  req.userId = data.user.id;
  req.sessionId = jwtSessionId(token); // the token was verified just above
  next();
}
