import dotenv from 'dotenv';

dotenv.config();

function reqEnv(name: string): string {
    const v = process.env[name];
    if (!v) throw new Error (`Missing env var: ${name}`);
    return v;
}

type Env = {
    PORT: number;
    VERIFY_TOKEN: string;
    WHATSAPP_TOKEN: string;
    PHONE_NUMBER_ID: string;
    GRAPH_VERSION: string;
    META_APP_SECRET: string;
    MONGODB_URI: string;
    // Usuario "original" del panel. Ahora es opcional: puede existir solo él, solo AUTH_USERS, o ambos.
    AUTH_USERNAME?: string;
    // Lista de usuarios extra para el login, en formato "usuario1:hashBcrypt1,usuario2:hashBcrypt2".
    // Se interpreta (se "parsea") en auth.service.ts, no aquí.
    AUTH_USERS?: string;
    AUTH_PASSWORD_HASH?: string;
    AUTH_PASSWORD_PLAIN?: string;
    AUTH_PASSWORD_PEPPER?: string;
    JWT_SECRET: string;
    CONTACTO_TEL: string;
    PRE_SOLICITUD_ENABLED: boolean;
};

const base = {
    PORT : Number(process.env.PORT || 3000),
    VERIFY_TOKEN : reqEnv('VERIFY_TOKEN'),
    WHATSAPP_TOKEN : reqEnv('WHATSAPP_TOKEN'),
    PHONE_NUMBER_ID : reqEnv('PHONE_NUMBER_ID'),
    GRAPH_VERSION : reqEnv('GRAPH_VERSION'),
    META_APP_SECRET : reqEnv('META_APP_SECRET'),
    MONGODB_URI : reqEnv('MONGODB_URI'),
    JWT_SECRET: reqEnv('JWT_SECRET'),
    CONTACTO_TEL: process.env.CONTACTO_TEL || '',
    // Bandera para apagar la pre-solicitud sin tocar código: solo bloquea entradas NUEVAS al flujo;
    // quien ya va a medias termina normal. Se apaga ÚNICAMENTE con el valor exacto '0'
    // (PRE_SOLICITUD_ENABLED=0). Si la variable no existe, o tiene cualquier otro valor ("false", "no"...),
    // queda encendida, para que nadie la apague sin querer por no haberla definido en Render.
    PRE_SOLICITUD_ENABLED: process.env.PRE_SOLICITUD_ENABLED !== '0'
} as const;

export const env: Env = {
    ...base,
    // Igual que las variables AUTH_PASSWORD_* de abajo: solo se agregan al objeto si vienen definidas.
    // Que exista al menos un usuario lo valida auth.service.ts al construir la lista de usuarios.
    ...(process.env.AUTH_USERNAME ? { AUTH_USERNAME: process.env.AUTH_USERNAME } : {}),
    ...(process.env.AUTH_USERS ? { AUTH_USERS: process.env.AUTH_USERS } : {}),
    ...(process.env.AUTH_PASSWORD_HASH ? { AUTH_PASSWORD_HASH: process.env.AUTH_PASSWORD_HASH } : {}),
    ...(process.env.AUTH_PASSWORD_PLAIN ? { AUTH_PASSWORD_PLAIN: process.env.AUTH_PASSWORD_PLAIN } : {}),
    ...(process.env.AUTH_PASSWORD_PEPPER ? { AUTH_PASSWORD_PEPPER: process.env.AUTH_PASSWORD_PEPPER } : {})
};
