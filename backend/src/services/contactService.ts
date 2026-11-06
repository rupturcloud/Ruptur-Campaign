import { PrismaClient } from '@prisma/client';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { ContactInput, ContactsResponse } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import { CategoryService } from './categoryService';

const prisma = new PrismaClient();

const DATA_FILE = '/app/data/contacts.json';

const defaultContacts: any[] = [];

function loadContacts(): any[] {
  try {
    // Ensure directory exists
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log('📁 ContactService.loadContacts - diretório criado:', dir);
    }

    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(data, (key, value) => {
        if (key === 'criadoEm' || key === 'atualizadoEm') {
          return new Date(value);
        }
        return value;
      });
      console.log(`📂 ContactService.loadContacts - carregou ${parsed.length} contatos do arquivo`);
      return parsed;
    } else {
      console.log('📂 ContactService.loadContacts - arquivo não existe, iniciando com contatos padrão');
      // Initialize with default contacts when file doesn't exist
      saveContacts(defaultContacts);
      return [...defaultContacts];
    }
  } catch (error) {
    console.error('❌ ContactService.loadContacts - erro ao carregar:', error);
    // In case of error, initialize with default contacts
    console.log('📂 ContactService.loadContacts - erro encontrado, iniciando com contatos padrão');
    try {
      saveContacts(defaultContacts);
      return [...defaultContacts];
    } catch (saveError) {
      console.error('❌ ContactService.loadContacts - erro ao salvar contatos padrão:', saveError);
      return [...defaultContacts];
    }
  }
}

function saveContacts(contacts: any[]): void {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(contacts, null, 2));
  } catch (error) {
    console.error('Erro ao salvar contatos:', error);
  }
}

// Removido cache em memória - sempre ler do arquivo para consistência entre instâncias

async function enrichContactsWithCategories(contactsList: any[]): Promise<any[]> {
  try {
    const categories = await CategoryService.getAllCategories();
    return contactsList.map(contact => {
      if (contact.categoriaId) {
        const categoria = categories.find(cat => cat.id === contact.categoriaId);
        return { ...contact, categoria };
      }
      return { ...contact, categoria: null };
    });
  } catch (error) {
    console.error('Erro ao buscar categorias:', error);
    return contactsList.map(contact => ({ ...contact, categoria: null }));
  }
}

export class ContactService {
  static normalizePhone(phone: string): string {
    if (!phone) {
      throw new Error('N?mero de telefone obrigat?rio');
    }
    const raw = String(phone).trim();

    // 1. Tentar parse padr?o BR
    let phoneNumber = parsePhoneNumberFromString(raw, 'BR');

    // 2. Se falhar, tentar com prefixo + ou +55
    if (!phoneNumber || !phoneNumber.isValid()) {
      const digits = raw.replace(/\D/g, '');
      if (digits.length >= 10 && digits.length <= 13) {
        const candidate = digits.startsWith('55') ? `+${digits}` : `+55${digits}`;
        phoneNumber = parsePhoneNumberFromString(candidate, 'BR');
      }
    }

    if (phoneNumber && phoneNumber.isValid()) {
      return phoneNumber.format('E.164');
    }

    // 3. Fallback resiliente para n?meros nacionais de 10 a 13 d?gitos
    const digits = raw.replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 13) {
      return digits.startsWith('55') ? `+${digits}` : `+55${digits}`;
    }

    throw new Error(`N?mero de telefone inv?lido: "${phone}"`);
  }

  static async getContacts(
    search?: string,
    page: number = 1,
    pageSize: number = 30,
    tenantId?: string,
    tag?: string
  ): Promise<ContactsResponse> {
    try {
      console.log('📋 ContactService.getContacts - tenantId:', tenantId, 'tag:', tag);

      // Construir filtros dinâmicos
      const where: any = {};

      // Filtro por tenant (SUPERADMIN vê todos se tenantId for undefined)
      if (tenantId) {
        where.tenantId = tenantId;
      }

      // Filtro por categoria/tag
      if (tag) {
        where.categoriaId = tag;
      }

      // Filtro de busca
      if (search) {
        const searchLower = search.toLowerCase();
        where.OR = [
          { nome: { contains: searchLower, mode: 'insensitive' } },
          { telefone: { contains: search } },
          { email: { contains: searchLower, mode: 'insensitive' } }
        ];
      }

      // Buscar total de registros
      const total = await prisma.contact.count({ where });

      // Buscar contatos com paginação e incluir categoria
      const skip = (page - 1) * pageSize;
      const contacts = await prisma.contact.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { criadoEm: 'desc' },
        include: {
          categoria: true
        }
      });

      console.log('📋 ContactService.getContacts - total encontrados:', total);

      return {
        contacts,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      };
    } catch (error) {
      console.error('❌ ContactService.getContacts - erro:', error);
      throw error;
    }
  }

  static async getContactById(id: string, tenantId?: string) {
    try {
      const where: any = { id };

      // Filtro por tenant (SUPERADMIN pode acessar qualquer contato)
      if (tenantId) {
        where.tenantId = tenantId;
      }

      const contact = await prisma.contact.findFirst({
        where,
        include: {
          categoria: true
        }
      });

      if (!contact) {
        throw new Error('Contato não encontrado');
      }

      return contact;
    } catch (error) {
      console.error('❌ ContactService.getContactById - erro:', error);
      throw error;
    }
  }

  static async createContact(data: ContactInput) {
    try {
      console.log('📝 ContactService.createContact - data recebido:', JSON.stringify(data, null, 2));
      const normalizedPhone = this.normalizePhone(data.telefone);

      // Upsert por tenantId e telefone para evitar duplica??es e permitir enriquecimento de dados
      const existingContact = await prisma.contact.findFirst({
        where: {
          telefone: normalizedPhone,
          ...(data.tenantId ? { tenantId: data.tenantId } : {})
        }
      });

      if (existingContact) {
        const newTags = Array.isArray(data.tags) ? data.tags : [];
        const existingTags = Array.isArray(existingContact.tags) ? existingContact.tags : [];
        const mergedTags = Array.from(new Set([...existingTags, ...newTags]));

        const currentIsGeneric = !existingContact.nome || existingContact.nome.startsWith('Lead ');
        const newIsCustom = data.nome && !data.nome.startsWith('Lead ');
        const finalNome = (currentIsGeneric && newIsCustom) ? data.nome : (data.nome || existingContact.nome);

        const updated = await prisma.contact.update({
          where: { id: existingContact.id },
          data: {
            nome: finalNome,
            email: data.email !== undefined ? (data.email || null) : existingContact.email,
            observacoes: data.observacoes !== undefined ? (data.observacoes || null) : existingContact.observacoes,
            tags: mergedTags,
            categoriaId: data.categoriaId !== undefined ? (data.categoriaId || null) : existingContact.categoriaId
          },
          include: {
            categoria: true
          }
        });

        console.log('?? ContactService.createContact - contato existente atualizado:', updated.id);
        return updated;
      }

      const newContact = await prisma.contact.create({
        data: {
          nome: data.nome,
          telefone: normalizedPhone,
          email: data.email || null,
          observacoes: data.observacoes || null,
          tags: data.tags || [],
          categoriaId: data.categoriaId || null,
          tenantId: data.tenantId || null
        },
        include: {
          categoria: true
        }
      });

      console.log('? ContactService.createContact - contato criado:', newContact.id);
      return newContact;
    } catch (error) {
      console.error('❌ ContactService.createContact - erro:', error);
      throw error;
    }
  }

  static async updateContact(id: string, data: ContactInput, tenantId?: string) {
    try {
      const normalizedPhone = this.normalizePhone(data.telefone);

      // Construir where clause com tenant isolation
      const where: any = { id };
      if (tenantId) {
        where.tenantId = tenantId;
      }

      // Verificar se o contato existe e pertence ao tenant
      const existingContact = await prisma.contact.findFirst({ where });
      if (!existingContact) {
        throw new Error('Contato não encontrado');
      }

      const updatedContact = await prisma.contact.update({
        where: { id },
        data: {
          nome: data.nome,
          telefone: normalizedPhone,
          email: data.email || null,
          observacoes: data.observacoes || null,
          tags: data.tags || [],
          categoriaId: data.categoriaId || null
        },
        include: {
          categoria: true
        }
      });

      console.log('✅ ContactService.updateContact - contato atualizado:', id);
      return updatedContact;
    } catch (error) {
      console.error('❌ ContactService.updateContact - erro:', error);
      throw error;
    }
  }

  static async deleteContact(id: string, tenantId?: string) {
    try {
      // Construir where clause com tenant isolation
      const where: any = { id };
      if (tenantId) {
        where.tenantId = tenantId;
      }

      // Verificar se o contato existe e pertence ao tenant
      const existingContact = await prisma.contact.findFirst({ where });
      if (!existingContact) {
        throw new Error('Contato não encontrado');
      }

      await prisma.contact.delete({
        where: { id }
      });

      console.log('✅ ContactService.deleteContact - contato excluído:', id);
    } catch (error) {
      console.error('❌ ContactService.deleteContact - erro:', error);
      throw error;
    }
  }

  static async bulkUpdateContacts(contactIds: string[], updates: any, tenantId?: string) {
    try {
      console.log('📝 ContactService.bulkUpdateContacts - IDs:', contactIds.length);

      // Construir where clause com tenant isolation
      const where: any = {
        id: { in: contactIds }
      };
      if (tenantId) {
        where.tenantId = tenantId;
      }

      // Verificar quantos contatos existem e pertencem ao tenant
      const existingContacts = await prisma.contact.count({ where });
      if (existingContacts === 0) {
        throw new Error('Nenhum contato encontrado para atualizar');
      }

      // Preparar dados de atualização
      const updateData: any = {};
      if (updates.categoriaId !== undefined) {
        updateData.categoriaId = updates.categoriaId;
      }
      if (updates.tags !== undefined) {
        updateData.tags = updates.tags;
      }
      if (updates.observacoes !== undefined) {
        updateData.observacoes = updates.observacoes;
      }

      // Atualizar contatos
      const result = await prisma.contact.updateMany({
        where,
        data: updateData
      });

      console.log('✅ ContactService.bulkUpdateContacts - contatos atualizados:', result.count);
      return {
        message: `${result.count} contato(s) atualizado(s) com sucesso`,
        count: result.count
      };
    } catch (error) {
      console.error('❌ ContactService.bulkUpdateContacts - erro:', error);
      throw error;
    }
  }

  static async bulkDeleteContacts(contactIds: string[], tenantId?: string) {
    try {
      console.log('🗑️ ContactService.bulkDeleteContacts - IDs:', contactIds.length);

      // Construir where clause com tenant isolation
      const where: any = {
        id: { in: contactIds }
      };
      if (tenantId) {
        where.tenantId = tenantId;
      }

      // Verificar quantos contatos existem e pertencem ao tenant
      const existingContacts = await prisma.contact.count({ where });
      if (existingContacts === 0) {
        throw new Error('Nenhum contato encontrado para excluir');
      }

      // Excluir contatos
      const result = await prisma.contact.deleteMany({
        where
      });

      console.log('✅ ContactService.bulkDeleteContacts - contatos excluídos:', result.count);
      return {
        message: `${result.count} contato(s) excluído(s) com sucesso`,
        count: result.count
      };
    } catch (error) {
      console.error('❌ ContactService.bulkDeleteContacts - erro:', error);
      throw error;
    }
  }
}