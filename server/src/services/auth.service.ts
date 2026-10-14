import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { env } from "../config/env.js";

// Caracteres permitidos en un nombre de usuario (letras, números, punto, guion y guion bajo; máximo 64).
// Se exporta para que el controlador de login y la lista AUTH_USERS usen exactamente la misma regla.
export const USERNAME_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

// Forma de un hash bcrypt válido: empieza con "$2a$", "$2b$" o "$2y$", luego el costo en 2 dígitos,
// otro "$" y 53 caracteres. Sirve para detectar al arrancar un hash mal copiado en AUTH_USERS,
// en lugar de descubrirlo cuando alguien no pueda entrar.
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

// "Costo" de bcrypt: qué tan lento (y por lo tanto difícil de adivinar a fuerza bruta) es calcular un hash.
// Es el mismo valor que ya se usaba antes para AUTH_PASSWORD_PLAIN.
const BCRYPT_COST = 12;

export function applyPepper(value: string) {
  const pepper = env.AUTH_PASSWORD_PEPPER;
  return pepper ? `${value}${pepper}` : value;
}

// Convierte el texto de AUTH_USERS ("ana:$2b$12$...,luis:$2b$12$...") en un mapa usuario → hash.
// Si algo viene mal escrito lanza un error con el número de entrada, para que sea fácil de corregir
// sin tener que imprimir el hash en los logs.
function parseAuthUsers(raw: string): Map<string, string> {
  const users = new Map<string, string>();
  const entries = raw.split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0);

  entries.forEach((entry, index) => {
    const position = index + 1;
    // Se corta en el PRIMER ":" porque un hash bcrypt nunca contiene ":", así que todo lo que sigue es el hash.
    const separatorIndex = entry.indexOf(":");
    if (separatorIndex === -1) {
      throw new Error(`AUTH_USERS: la entrada #${position} no tiene el formato usuario:hash`);
    }
    const username = entry.slice(0, separatorIndex).trim();
    const hash = entry.slice(separatorIndex + 1).trim();

    if (!USERNAME_PATTERN.test(username)) {
      throw new Error(`AUTH_USERS: el usuario de la entrada #${position} tiene caracteres no permitidos`);
    }
    if (!BCRYPT_HASH_PATTERN.test(hash)) {
      throw new Error(`AUTH_USERS: el hash del usuario "${username}" no es un hash bcrypt válido`);
    }
    if (users.has(username)) {
      throw new Error(`AUTH_USERS: el usuario "${username}" está repetido`);
    }
    users.set(username, hash);
  });

  return users;
}

// Hash del usuario "original" (AUTH_USERNAME). Misma lógica que había antes:
// si existe AUTH_PASSWORD_HASH se usa tal cual; si no, se hashea AUTH_PASSWORD_PLAIN al arrancar.
function getLegacyPasswordHash(): string {
  if (env.AUTH_PASSWORD_HASH) return env.AUTH_PASSWORD_HASH;
  if (env.AUTH_PASSWORD_PLAIN) return bcrypt.hashSync(applyPepper(env.AUTH_PASSWORD_PLAIN), BCRYPT_COST);
  throw new Error("Missing AUTH_PASSWORD_HASH or AUTH_PASSWORD_PLAIN (requerido porque AUTH_USERNAME está definido)");
}

// Junta todos los usuarios que pueden entrar: los de AUTH_USERS más el usuario original de AUTH_USERNAME,
// que se mantiene para que el login actual siga funcionando sin cambiar nada en Render.
function buildUserHashes(): Map<string, string> {
  const users = env.AUTH_USERS ? parseAuthUsers(env.AUTH_USERS) : new Map<string, string>();

  if (env.AUTH_USERNAME) {
    if (users.has(env.AUTH_USERNAME)) {
      throw new Error(`El usuario "${env.AUTH_USERNAME}" está en AUTH_USERNAME y también en AUTH_USERS; déjalo solo en uno`);
    }
    users.set(env.AUTH_USERNAME, getLegacyPasswordHash());
  }

  if (users.size === 0) {
    throw new Error("Missing AUTH_USERS or AUTH_USERNAME: no hay ningún usuario configurado para el login");
  }
  return users;
}

// Se construye UNA sola vez al cargar el módulo (al arrancar el servidor). Si la configuración está mal,
// el servidor no arranca y el error sale en consola, igual que pasaba antes cuando faltaba AUTH_USERNAME.
const userHashes = buildUserHashes();

// Hash de un texto aleatorio que nadie conoce. Cuando el usuario NO existe, igual comparamos el password
// contra este hash para que la respuesta tarde lo mismo que con un usuario real. Así nadie puede
// averiguar qué usuarios existen midiendo cuánto tarda el login en contestar.
const dummyHash = bcrypt.hashSync(crypto.randomBytes(32).toString("hex"), BCRYPT_COST);

// Revisa si el usuario existe y si el password (con pepper) coincide con su hash.
export async function verifyCredentials(username: string, password: string): Promise<boolean> {
  const hash = userHashes.get(username);
  const passwordMatches = await bcrypt.compare(applyPepper(password), hash ?? dummyHash);
  return hash !== undefined && passwordMatches;
}
