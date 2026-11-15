import { HttpException, HttpStatus } from '@nestjs/common';
import { ZodSchema } from 'zod';

export function parse(schema: ZodSchema, data: unknown): any {
  const r: any = schema.safeParse(data);
  if (!r.success) throw new HttpException({ message: 'Input tidak valid', issues: r.error.issues }, HttpStatus.BAD_REQUEST);
  return r.data;
}

/** Terjemahkan galat Postgres dari trigger/constraint menjadi respons HTTP yang jelas. */
export function mapDbError(e: any): never {
  if (e instanceof HttpException) throw e;
  const code = e?.code as string | undefined;
  const msg = String(e?.message ?? '');
  if (code === '42501') throw new HttpException(msg.includes('row-level') ? 'Akses ditolak' : msg, HttpStatus.FORBIDDEN);
  if (code === '23514') throw new HttpException(msg, HttpStatus.UNPROCESSABLE_ENTITY);
  if (code === '23505') throw new HttpException('Data duplikat', HttpStatus.CONFLICT);
  if (code === '23503') throw new HttpException('Referensi data tidak ditemukan', HttpStatus.UNPROCESSABLE_ENTITY);
  throw e;
}
