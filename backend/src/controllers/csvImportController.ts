import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import multer from 'multer';
import * as path from 'path';
import { CSVImportService } from '../services/csvImportService';
import { CategoryService } from '../services/categoryService';
import { ApiError } from '../types';

// Configurar multer para upload de arquivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, '/tmp/uploads'); // Usar diretório temporário
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'import-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req: AuthenticatedRequest, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.mimetype === 'text/csv' ||
      file.mimetype === 'application/csv' ||
      path.extname(file.originalname).toLowerCase() === '.csv') {
    cb(null, true);
  } else {
    cb(new Error('Apenas arquivos CSV são permitidos'));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max
  }
});

export class CSVImportController {
  static async importContacts(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.file) {
        const apiError: ApiError = {
          error: 'Nenhum arquivo foi enviado'
        };
        return res.status(400).json(apiError);
      }

      // Obter tenantId da requisição autenticada
      const tenantId = req.tenantId;
      if (!tenantId) {
        const apiError: ApiError = {
          error: 'Tenant não identificado'
        };
        return res.status(403).json(apiError);
      }

      const rawCategoriaId = typeof req.body?.categoriaId === 'string' ? req.body.categoriaId.trim() : '';
      const newCategoryName = typeof req.body?.newCategoryName === 'string' ? req.body.newCategoryName.trim() : '';
      const newCategoryColor = typeof req.body?.newCategoryColor === 'string' && req.body.newCategoryColor.trim()
        ? req.body.newCategoryColor.trim()
        : '#1e3a5f';
      const newCategoryDescription = typeof req.body?.newCategoryDescription === 'string' && req.body.newCategoryDescription.trim()
        ? req.body.newCategoryDescription.trim()
        : undefined;

      let effectiveCategoriaId: string | undefined = rawCategoriaId || undefined;
      let createdCategory: any = null;

      if (!effectiveCategoriaId && newCategoryName) {
        createdCategory = await CategoryService.createCategory(
          {
            nome: newCategoryName,
            cor: newCategoryColor,
            descricao: newCategoryDescription,
          },
          tenantId
        );
        effectiveCategoriaId = createdCategory.id;
        console.log('📂 Nova categoria criada durante importação CSV:', createdCategory.id, createdCategory.nome);
      }

      console.log(
        '📤 Upload recebido:',
        req.file.originalname,
        req.file.filename,
        'tenantId:',
        tenantId,
        'categoriaId:',
        effectiveCategoriaId || '(nenhuma)'
      );

      const result = await CSVImportService.importContacts(req.file.path, tenantId, effectiveCategoriaId);

      if (result.success) {
        res.json({
          message: 'Importação concluída com sucesso',
          ...result
        });
      } else {
        res.status(207).json({ // 207 Multi-Status para importações parciais
          message: 'Importação concluída com alguns erros',
          ...result
        });
      }
    } catch (error) {
      console.error('❌ Erro na importação CSV:', error);
      const apiError: ApiError = {
        error: 'Erro ao processar arquivo CSV',
        details: error instanceof Error ? error.message : error
      };
      res.status(500).json(apiError);
    }
  }

  static async downloadTemplate(req: AuthenticatedRequest, res: Response) {
    try {
      // CSV template com cabeçalhos em português
      const csvTemplate = `nome,telefone,email,observacoes,categoriaId
João Silva,+5511999999999,joao@email.com,Cliente desde 2020,550e8400-e29b-41d4-a716-446655440000
Maria Santos,+5511888888888,maria@email.com,Fornecedor de materiais,550e8400-e29b-41d4-a716-446655440001
Pedro Oliveira,+5511777777777,pedro@email.com,,
Ana Costa,+5511666666666,ana@email.com,Parceiro estratégico,550e8400-e29b-41d4-a716-446655440000`;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="template-contatos.csv"');
      res.send(csvTemplate);
    } catch (error) {
      console.error('❌ Erro ao gerar template:', error);
      const apiError: ApiError = {
        error: 'Erro ao gerar template CSV'
      };
      res.status(500).json(apiError);
    }
  }
}