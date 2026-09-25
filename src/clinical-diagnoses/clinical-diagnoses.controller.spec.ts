import { Test, TestingModule } from '@nestjs/testing';
import { ClinicalDiagnosesController } from './clinical-diagnoses.controller.js';
import { ClinicalDiagnosesService } from './clinical-diagnoses.service.js';
import { SupabaseAuthGuard } from '../auth/supabase.guard.js';
import { RolesGuard } from '../auth/roles/roles.guard.js';
import { vi } from 'vitest';
import { ClinicalDiagnosisType } from '@prisma/client';

describe('ClinicalDiagnosesController', () => {
  let controller: ClinicalDiagnosesController;
  let service: ClinicalDiagnosesService;

  beforeEach(async () => {
    const mockService = {
      createDiagnosis: vi.fn(),
      updateDiagnosis: vi.fn(),
      resolveDiagnosis: vi.fn(),
      getDiagnoses: vi.fn(),
      getDiagnosisById: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClinicalDiagnosesController],
      providers: [
        { provide: ClinicalDiagnosesService, useValue: mockService },
      ],
    })
      .overrideGuard(SupabaseAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ClinicalDiagnosesController>(ClinicalDiagnosesController);
    service = module.get<ClinicalDiagnosesService>(ClinicalDiagnosesService);
  });

  const mockUser = (id: string, role: string) => ({
    app_user_id: id,
    app_role: role,
  });

  describe('createDiagnosis', () => {
    it('calls service createDiagnosis', async () => {
      const dto = { diagnosis_type: ClinicalDiagnosisType.PRIMARY, diagnosis_name: 'Fever' };
      await controller.createDiagnosis(mockUser('doc-1', 'DOCTOR'), 'e-1', dto);
      expect(service.createDiagnosis).toHaveBeenCalledWith('doc-1', 'e-1', dto);
    });
  });

  describe('updateDiagnosis', () => {
    it('calls service updateDiagnosis', async () => {
      const dto = { diagnosis_name: 'Cold' };
      await controller.updateDiagnosis(mockUser('doc-1', 'DOCTOR'), 'e-1', 'diag-1', dto);
      expect(service.updateDiagnosis).toHaveBeenCalledWith('doc-1', 'e-1', 'diag-1', dto);
    });
  });

  describe('resolveDiagnosis', () => {
    it('calls service resolveDiagnosis', async () => {
      await controller.resolveDiagnosis(mockUser('doc-1', 'DOCTOR'), 'e-1', 'diag-1');
      expect(service.resolveDiagnosis).toHaveBeenCalledWith('doc-1', 'e-1', 'diag-1');
    });
  });

  describe('getDiagnoses', () => {
    it('calls service getDiagnoses', async () => {
      await controller.getDiagnoses(mockUser('pat-1', 'PATIENT'), 'e-1');
      expect(service.getDiagnoses).toHaveBeenCalledWith('pat-1', 'PATIENT', 'e-1');
    });
  });

  describe('getDiagnosisById', () => {
    it('calls service getDiagnosisById', async () => {
      await controller.getDiagnosisById(mockUser('pat-1', 'PATIENT'), 'e-1', 'diag-1');
      expect(service.getDiagnosisById).toHaveBeenCalledWith('pat-1', 'PATIENT', 'e-1', 'diag-1');
    });
  });
});
