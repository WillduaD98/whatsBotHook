import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { USERNAME_PATTERN, verifyCredentials } from "../services/auth.service.js";

export async function login(req: Request, res: Response) {
  const { username, password } = req.body || {};
  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ message: "username and password are required" });
  }
  const uname = username.trim();
  if (!USERNAME_PATTERN.test(uname)) {
    return res.status(400).json({ message: "invalid credentials" });
  }
  if (password.length < 1 || password.length > 256) {
    return res.status(400).json({ message: "invalid credentials" });
  }
  // verifyCredentials busca al usuario en la lista (AUTH_USERS + AUTH_USERNAME) y compara el password.
  // Si el usuario no existe responde igual de "invalid credentials", sin decir cuál de los dos falló.
  let ok = false;
  try {
    ok = await verifyCredentials(uname, password);
  } catch (error) {
    // Solo pasa si un hash guardado está corrupto; se registra para poder detectarlo y se niega el acceso.
    console.error('Error verifying credentials:', error);
    ok = false;
  }
  if (!ok) return res.status(401).json({ message: "invalid credentials" });
  const token = jwt.sign({ sub: username }, env.JWT_SECRET, { expiresIn: "12h" });
  return res.status(200).json({ token });
}
