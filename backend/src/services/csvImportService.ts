import * as fs from 'fs';
import csvParser from 'csv-parser';
import { PrismaClient } from '@prisma/client';
import { ContactService } from './contactService';
import { ContactInput, ImportResult } from '../types';

const prisma = new PrismaClient();

function cleanHeader(header: string): string {
  return String(header || '')
    .replace(/^\uFEFF/, '') // Remove UTF-8 BOM
    .replace(/["'\r\n]/g, '')
    .trim()
    .toLowerCase();
}

function detectSeparator(filePath: string): string {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(4096);
    const bytesRead = fs.readSync(fd, buffer, 0, 4096, 0);
    fs.closeSync(fd);
    const content = buffer.toString('utf8', 0, bytesRead);
    const firstLine = content.split(/\r?\n/).find(line => line.trim().length > 0) || '';

    const semicolons = (firstLine.match(/;/g) || []).length;
    const commas = (firstLine.match(/,/g) || []).length;
    const tabs = (firstLine.match(/\t/g) || []).length;

    if (semicolons > commas && semicolons > tabs) return ';';
    if (tabs > commas && tabs > semicolons) return '\t';
    return ',';
  } catch (err) {
    console.warn('?? CSVImportService - Erro ao detectar separador, usando v?rgula por padr?o:', err);
    return ',';
  }
}

function detectHasHeader(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(4096);
    const bytesRead = fs.readSync(fd, buffer, 0, 4096, 0);
    fs.closeSync(fd);
    const content = buffer.toString('utf8', 0, bytesRead);
    const firstLine = content.split(/\r?\n/).find(line => line.trim().length > 0) || '';
    if (!firstLine) return false;

    // Se contiver 8 ou mais d?gitos consecutivos na primeira linha, ? um n?mero/lead direto, N?O um header
    if (/\d{8,15}/.test(firstLine)) {
      return false;
    }

    // Se contiver letras, ? uma linha de cabe?alhos (ex: telefone, nome, email, etc.)
    return /[a-zA-Z]/.test(firstLine);
  } catch {
    return true;
  }
}

function resolveRowPhone(row: Record<string, any>): string | null {
  const phoneKeys = ['telefone', 'phone', 'celular', 'numero', 'number', 'whatsapp', 'zap', 'tel', 'mobile', 'fone', 'contato'];

  // 1. Procurar por chaves conhecidas
  for (const [key, val] of Object.entries(row)) {
    const k = cleanHeader(key).replace(/[^a-z0-9]/g, '');
    if (phoneKeys.some(pk => k === pk || k.includes(pk))) {
      const s = String(val || '').trim();
      if (s.replace(/\D/g, '').length >= 8) return s;
    }
  }

  // 2. Se for indexado ou nome desconhecido, procurar coluna com valor compat?vel com telefone
  for (const [key, val] of Object.entries(row)) {
    const s = String(val || '').trim();
    const digits = s.replace(/\D/g, '');
    if (digits.length >= 8 && digits.length <= 15) {
      return s;
    }
  }

  return null;
}

function resolveRowName(row: Record<string, any>, phoneFallback: string, index: number): string {
  const nameKeys = ['nome', 'name', 'cliente', 'lead', 'razaosocial', 'razao_social', 'contato', 'usuario', 'destinatario', 'pessoa'];
  const phoneDigits = phoneFallback.replace(/\D/g, '');

  for (const [key, val] of Object.entries(row)) {
    const k = cleanHeader(key).replace(/[^a-z0-9]/g, '');
    if (nameKeys.some(nk => k === nk || k.includes(nk))) {
      const s = String(val || '').trim();
      if (s && s.replace(/\D/g, '') !== phoneDigits) {
        return s;
      }
    }
  }

  // Se houver mais de uma coluna e uma foi o telefone, verificar se a outra cont?m texto alfab?tico
  const entries = Object.entries(row);
  if (entries.length > 1) {
    for (const [key, val] of entries) {
      const s = String(val || '').trim();
      if (s && s.replace(/\D/g, '') !== phoneDigits && /[a-zA-Z]/.test(s)) {
        return s;
      }
    }
  }

  // Fallback seguro: nunca falha por aus?ncia de nome
  return phoneDigits ? `Lead ${phoneDigits}` : `Lead ${index}`;
}

function resolveRowEmail(row: Record<string, any>): string | undefined {
  for (const [key, val] of Object.entries(row)) {
    const k = cleanHeader(key).replace(/[^a-z0-9]/g, '');
    if (k.includes('email') || k.includes('mail')) {
      const s = String(val || '').trim();
      if (s && s.includes('@')) return s;
    }
  }
  for (const [key, val] of Object.entries(row)) {
    const s = String(val || '').trim();
    if (s && s.includes('@') && s.includes('.')) {
      return s;
    }
  }
  return undefined;
}

function resolveRowTags(row: Record<string, any>): string[] {
  for (const [key, val] of Object.entries(row)) {
    const k = cleanHeader(key).replace(/[^a-z0-9]/g, '');
    if (k.includes('tag') || k.includes('etiqueta')) {
      const s = String(val || '').trim();
      if (s) {
        return s.split(/[,;]/).map(t => t.trim()).filter(Boolean);
      }
    }
  }
  return [];
}

function resolveRowNotes(row: Record<string, any>): string | undefined {
  const noteKeys = ['observacoes', 'observacao', 'obs', 'notas', 'nota', 'notes', 'detalhes'];
  for (const [key, val] of Object.entries(row)) {
    const k = cleanHeader(key).replace(/[^a-z0-9]/g, '');
    if (noteKeys.some(nk => k === nk || k.includes(nk))) {
      const s = String(val || '').trim();
      if (s) return s;
    }
  }
  return undefined;
}

function resolveRowCategory(row: Record<string, any>, defaultCategoriaId?: string): string | undefined {
  if (defaultCategoriaId && defaultCategoriaId.trim()) {
    return defaultCategoriaId.trim();
  }
  for (const [key, val] of Object.entries(row)) {
    const k = cleanHeader(key).replace(/[^a-z0-9]/g, '');
    if (k.includes('categoria')) {
      const s = String(val || '').trim();
      if (s) return s;
    }
  }
  return undefined;
}

export class CSVImportService {
  /**
   * Verifica se o tenant tem quota dispon?vel para importar os contatos
   */
  static async checkQuotaForImport(tenantId: string, contactsToImport: number): Promise<{ allowed: boolean; message?: string; remaining?: number }> {
    try {
      const tenantQuota = await prisma.tenantQuota.findUnique({
        where: { tenantId },
        include: {
          tenant: {
            include: {
              _count: {
                select: { contacts: true }
              }
            }
          }
        }
      });

      if (!tenantQuota) {
        return { allowed: true, remaining: 999999 };
      }

      const currentContacts = tenantQuota.tenant?._count?.contacts ?? 0;
      const maxContacts = tenantQuota.maxContacts ?? 0;

      if (maxContacts <= 0) {
        return { allowed: true, remaining: 999999 };
      }

      const remaining = maxContacts - currentContacts;

      if (contactsToImport > remaining) {
        return {
          allowed: false,
          message: `Limite de contatos seria excedido. Atual: ${currentContacts}/${maxContacts}. Tentando importar: ${contactsToImport}. Dispon?vel: ${remaining}.`,
          remaining
        };
      }

      return { allowed: true, remaining };
    } catch (err) {
      console.warn('?? CSVImportService - Erro ao verificar quota, autorizando importa??o:', err);
      return { allowed: true, remaining: 999999 };
    }
  }

  static async importContacts(filePath: string, tenantId: string, defaultCategoriaId?: string): Promise<ImportResult> {
    const results: Record<string, any>[] = [];
    const errors: string[] = [];
    let successfulImports = 0;
    let failedImports = 0;

    const separator = detectSeparator(filePath);
    const hasHeader = detectHasHeader(filePath);

    console.log(`?? CSVImportService - Detec??o do CSV: separador="${separator}", hasHeader=${hasHeader}`);

    return new Promise((resolve, reject) => {
      const parser = csvParser(
        hasHeader
          ? {
              separator,
              mapHeaders: ({ header }: { header: string }) => cleanHeader(header)
            }
          : {
              separator,
              headers: false
            }
      );

      fs.createReadStream(filePath)
        .pipe(parser)
        .on('data', (data: Record<string, any>) => {
          results.push(data);
        })
        .on('end', async () => {
          console.log(`?? CSVImportService - Processando ${results.length} linhas do CSV para tenantId: ${tenantId}`);

          // Verificar quota ANTES de importar
          const quotaCheck = await CSVImportService.checkQuotaForImport(tenantId, results.length);
          if (!quotaCheck.allowed) {
            console.log(`? CSVImportService - Quota excedida: ${quotaCheck.message}`);
            try {
              fs.unlinkSync(filePath);
            } catch (error) {
              console.warn('Erro ao limpar arquivo tempor?rio:', error);
            }
            resolve({
              success: false,
              totalRows: results.length,
              successfulImports: 0,
              failedImports: results.length,
              errors: [quotaCheck.message || 'Limite de contatos excedido']
            });
            return;
          }

          console.log(`? CSVImportService - Quota verificada. Dispon?vel: ${quotaCheck.remaining} contatos`);

          for (let i = 0; i < results.length; i++) {
            const row = results[i];
            const rowNumber = hasHeader ? i + 2 : i + 1;

            // Ignorar linhas totalmente em branco
            const hasAnyContent = Object.values(row).some(v => v !== null && v !== undefined && String(v).trim().length > 0);
            if (!hasAnyContent) {
              continue;
            }

            try {
              const phone = resolveRowPhone(row);
              if (!phone) {
                console.log(`? Linha ${rowNumber} - Telefone n?o encontrado:`, JSON.stringify(row));
                errors.push(`Linha ${rowNumber}: Telefone n?o encontrado ou inv?lido`);
                failedImports++;
                continue;
              }

              const name = resolveRowName(row, phone, i + 1);
              const email = resolveRowEmail(row);
              const tags = resolveRowTags(row);
              const observacoes = resolveRowNotes(row);
              const resolvedCategoriaId = resolveRowCategory(row, defaultCategoriaId);

              const contactData: ContactInput = {
                nome: name,
                telefone: phone,
                email,
                observacoes,
                tags,
                categoriaId: resolvedCategoriaId,
                tenantId
              };

              // Criar ou atualizar contato
              await ContactService.createContact(contactData);
              successfulImports++;
              console.log(`? Linha ${rowNumber} importada com sucesso: ${contactData.nome} (${contactData.telefone})`);
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
              errors.push(`Linha ${rowNumber}: ${errorMessage}`);
              failedImports++;
              console.log(`? Erro na linha ${rowNumber}: ${errorMessage}`);
            }
          }

          // Limpar arquivo tempor?rio
          try {
            fs.unlinkSync(filePath);
          } catch (error) {
            console.warn('Erro ao limpar arquivo tempor?rio:', error);
          }

          const result: ImportResult = {
            success: errors.length === 0,
            totalRows: results.length,
            successfulImports,
            failedImports,
            errors
          };

          console.log('?? Resultado da importa??o:', result);
          resolve(result);
        })
        .on('error', (error: any) => {
          console.error('? Erro ao processar CSV:', error);
          reject(error);
        });
    });
  }
}
