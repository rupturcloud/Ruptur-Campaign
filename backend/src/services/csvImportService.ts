import * as fs from 'fs';
import csvParser from 'csv-parser';
import { PrismaClient } from '@prisma/client';
import { ContactService } from './contactService';
import { ContactInput, ImportResult } from '../types';

const prisma = new PrismaClient();

interface CSVRow {
  nome?: string;
  telefone?: string;
  email?: string;
  observacoes?: string;
  tags?: string;
  categoriaid?: string; // CSV parser converte para lowercase
}

export class CSVImportService {
  /**
   * Verifica se o tenant tem quota disponível para importar os contatos
   */
  static async checkQuotaForImport(tenantId: string, contactsToImport: number): Promise<{ allowed: boolean; message?: string; remaining?: number }> {
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
      return { allowed: false, message: 'Configuração de quotas não encontrada para este tenant.' };
    }

    const currentContacts = tenantQuota.tenant._count.contacts;
    const maxContacts = tenantQuota.maxContacts;
    const remaining = maxContacts - currentContacts;

    if (contactsToImport > remaining) {
      return {
        allowed: false,
        message: `Limite de contatos seria excedido. Atual: ${currentContacts}/${maxContacts}. Tentando importar: ${contactsToImport}. Disponível: ${remaining}.`,
        remaining
      };
    }

    return { allowed: true, remaining };
  }

  static async importContacts(filePath: string, tenantId: string, defaultCategoriaId?: string): Promise<ImportResult> {
    const results: CSVRow[] = [];
    const errors: string[] = [];
    let successfulImports = 0;
    let failedImports = 0;

    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csvParser({
          mapHeaders: ({ header }: { header: string }) => header.toLowerCase().trim()
        }))
        .on('data', (data: CSVRow) => {
          results.push(data);
        })
        .on('end', async () => {
          console.log(`📊 CSVImportService - Processando ${results.length} linhas do CSV para tenantId: ${tenantId}`);

          // Verificar quota ANTES de importar
          const quotaCheck = await CSVImportService.checkQuotaForImport(tenantId, results.length);
          if (!quotaCheck.allowed) {
            console.log(`❌ CSVImportService - Quota excedida: ${quotaCheck.message}`);
            // Limpar arquivo temporário
            try {
              fs.unlinkSync(filePath);
            } catch (error) {
              console.warn('Erro ao limpar arquivo temporário:', error);
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

          console.log(`✅ CSVImportService - Quota verificada. Disponível: ${quotaCheck.remaining} contatos`);

          for (let i = 0; i < results.length; i++) {
            const row = results[i];
            const rowNumber = i + 2; // +2 porque CSV tem header e arrays começam em 0

            console.log(`🔍 Linha ${rowNumber} - Dados parseados:`, JSON.stringify(row));
            console.log(`📋 Headers disponíveis:`, Object.keys(row));

            try {
              // Validar campos obrigatórios
              if (!row.nome || !row.telefone) {
                console.log(`❌ Linha ${rowNumber} - nome: "${row.nome}", telefone: "${row.telefone}"`);
                errors.push(`Linha ${rowNumber}: Nome e telefone são obrigatórios`);
                failedImports++;
                continue;
              }

              // Preparar dados do contato incluindo tenantId e categoria selecionada/criada
              const tags = row.tags ? row.tags.split(',').map((tag: string) => tag.trim()) : [];
              const resolvedCategoriaId = (defaultCategoriaId && defaultCategoriaId.trim())
                ? defaultCategoriaId.trim()
                : (row.categoriaid?.trim() || undefined);
              const contactData: ContactInput = {
                nome: row.nome.trim(),
                telefone: row.telefone.trim(),
                email: row.email?.trim() || undefined,
                observacoes: row.observacoes?.trim() || undefined,
                tags: tags,
                categoriaId: resolvedCategoriaId,
                tenantId: tenantId
              };

              console.log(`🏷️ Linha ${rowNumber} - Tags extraídas:`, tags);
              console.log(`📂 Linha ${rowNumber} - CategoriaId:`, row.categoriaid);

              // Criar contato
              await ContactService.createContact(contactData);
              successfulImports++;
              console.log(`✅ Linha ${rowNumber} importada: ${contactData.nome} (tenant: ${tenantId})`);

            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
              errors.push(`Linha ${rowNumber}: ${errorMessage}`);
              failedImports++;
              console.log(`❌ Erro na linha ${rowNumber}: ${errorMessage}`);
            }
          }

          // Limpar arquivo temporário
          try {
            fs.unlinkSync(filePath);
          } catch (error) {
            console.warn('Erro ao limpar arquivo temporário:', error);
          }

          const result: ImportResult = {
            success: errors.length === 0,
            totalRows: results.length,
            successfulImports,
            failedImports,
            errors
          };

          console.log('📈 Resultado da importação:', result);
          resolve(result);
        })
        .on('error', (error: any) => {
          console.error('❌ Erro ao processar CSV:', error);
          reject(error);
        });
    });
  }
}