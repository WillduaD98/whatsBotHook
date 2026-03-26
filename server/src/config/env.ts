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
    AUTH_USERNAME: string;
    AUTH_PASSWORD_HASH?: string;
    AUTH_PASSWORD_PLAIN?: string;
    AUTH_PASSWORD_PEPPER?: string;
    JWT_SECRET: string;
};

const base = {
    PORT : Number(process.env.PORT || 3000),
    VERIFY_TOKEN : reqEnv('VERIFY_TOKEN'),
    WHATSAPP_TOKEN : reqEnv('WHATSAPP_TOKEN'),
    PHONE_NUMBER_ID : reqEnv('PHONE_NUMBER_ID'),
    GRAPH_VERSION : reqEnv('GRAPH_VERSION'),
    META_APP_SECRET : reqEnv('META_APP_SECRET'),
    MONGODB_URI : reqEnv('MONGODB_URI'),
    AUTH_USERNAME: reqEnv('AUTH_USERNAME'),
    JWT_SECRET: reqEnv('JWT_SECRET')
} as const;

export const env: Env = {
    ...base,
    ...(process.env.AUTH_PASSWORD_HASH ? { AUTH_PASSWORD_HASH: process.env.AUTH_PASSWORD_HASH } : {}),
    ...(process.env.AUTH_PASSWORD_PLAIN ? { AUTH_PASSWORD_PLAIN: process.env.AUTH_PASSWORD_PLAIN } : {}),
    ...(process.env.AUTH_PASSWORD_PEPPER ? { AUTH_PASSWORD_PEPPER: process.env.AUTH_PASSWORD_PEPPER } : {})
};
