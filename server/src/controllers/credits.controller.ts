import { Request, Response } from 'express';
import { Credit } from '../models/Credit.js';
import { normalizeCreditNumber, upsertCredits, type CreditRow } from '../services/credit.service.js';

const CREDIT_CSV_COLUMNS: Record<string, keyof CreditRow> = {
    numerocredito: 'numeroCredito',
    nombre: 'nombre',
    clabe: 'clabe',
    referencia: 'referencia'
};

// Normaliza un encabezado de CSV para que "Número Crédito", " numero_credito " y "NUMEROCREDITO" apunten a la misma clave
function normalizeCsvHeader(header: string): string {
    return String(header ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, '');
}

// Parser CSV mínimo: separa por comas respetando campos entre comillas dobles (incluye "" como comilla escapada)
function parseCsvLine(line: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                current += ch;
            }
        } else if (ch === '"') {
            inQuotes = true;
        } else if (ch === ',') {
            fields.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    fields.push(current);
    return fields;
}

function parseCsv(text: string): string[][] {
    const content = String(text ?? '').replace(/^\uFEFF/, '');
    const lines = content.split(/\r\n|\r|\n/).filter((line) => line.length > 0);
    return lines.map(parseCsvLine);
}

// POST /api/credits/upload (multipart: file)
export const uploadCredits = async (req: Request, res: Response) => {
    try {
        const file = (req as any)?.file as
            | { originalname: string; mimetype: string; size: number; buffer: Buffer }
            | undefined;

        if (!file || !Buffer.isBuffer(file.buffer)) {
            return res.status(400).json({ message: 'file is required' });
        }

        const rows = parseCsv(file.buffer.toString('utf8'));
        if (rows.length === 0) {
            return res.status(400).json({ message: 'El CSV está vacío' });
        }

        const [headerRow, ...dataRows] = rows;
        const columnKeys = headerRow.map((h) => CREDIT_CSV_COLUMNS[normalizeCsvHeader(h)] ?? null);
        const requiredKeys: Array<keyof CreditRow> = ['numeroCredito', 'nombre', 'clabe', 'referencia'];
        const missingKeys = requiredKeys.filter((key) => !columnKeys.includes(key));

        if (missingKeys.length > 0) {
            return res.status(400).json({ message: `Encabezados faltantes: ${missingKeys.join(', ')}` });
        }

        const mapped: CreditRow[] = dataRows.map((cols) => {
            const row: CreditRow = {};
            columnKeys.forEach((key, idx) => {
                if (key) row[key] = cols[idx] ?? '';
            });
            return row;
        });

        const summary = await upsertCredits(mapped);
        return res.status(200).json(summary);
    } catch (error) {
        console.error('Error uploading credits CSV:', error);
        return res.status(500).json({ message: 'Error uploading credits CSV' });
    }
};

// GET /api/credits?page=1&pageSize=20&numeroCredito=123
export const listCredits = async (req: Request, res: Response) => {
    try {
        const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? '20'), 10) || 20));

        const searchRaw = String(req.query.numeroCredito ?? req.query.q ?? '').trim();
        const filter: any = {};
        if (searchRaw) {
            const normalized = normalizeCreditNumber(searchRaw);
            filter.numeroCredito = { $regex: normalized || searchRaw };
        }

        const [items, total] = await Promise.all([
            Credit.find(filter)
                .sort({ createdAt: -1 })
                .skip((page - 1) * pageSize)
                .limit(pageSize)
                .lean(),
            Credit.countDocuments(filter)
        ]);

        return res.status(200).json({ items, total, page, pageSize });
    } catch (error) {
        console.error('Error listing credits:', error);
        return res.status(500).json({ message: 'Error listing credits' });
    }
};
