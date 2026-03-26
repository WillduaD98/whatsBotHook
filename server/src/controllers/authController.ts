import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { applyPepper, getPasswordHash } from "../services/auth.service.js";

export async function login(req: Request, res: Response) {
  const { username, password } = req.body || {};
  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ message: "username and password are required" });
  }
  const uname = username.trim();
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(uname)) {
    return res.status(400).json({ message: "invalid credentials" });
  }
  if (password.length < 1 || password.length > 256) {
    return res.status(400).json({ message: "invalid credentials" });
  }
  if (uname !== env.AUTH_USERNAME) {
    return res.status(401).json({ message: "invalid credentials" });
  }
  let ok = false;
  try {
    ok = await bcrypt.compare(applyPepper(password), getPasswordHash());
  } catch {
    ok = false;
  }
  if (!ok) return res.status(401).json({ message: "invalid credentials" });
  const token = jwt.sign({ sub: username }, env.JWT_SECRET, { expiresIn: "12h" });
  return res.status(200).json({ token });
}
