import { Test, TestingModule } from '@nestjs/testing';
import { ClinicalEncountersController } from './clinical-encounters.controller.js';
import { ClinicalEncountersService } from './clinical-encounters.service.js';
import { AppRole } from '../auth/roles/roles.enum.js';
import { SupabaseAuthGuard } from '../auth/supabase.guard.js';
import { RolesGuard } from '../auth/roles/roles.guard.js';
import { vi } from 'vitest';

describe('ClinicalEncountersController', () => {
  let controller: ClinicalEncountersController;
  let mockService: any;
  let module: TestingModule;

  beforeEach(async () => {
    mockService = {
      createEncounter: vi.fn(),
      startEncounter: vi.fn(),
      completeEncounter: vi.fn(),
      cancelEncounter: vi.fn(),
      getEncounter: vi.fn(),
      getEncounterByAppointment: vi.fn(),
    };

    module = await Test.createTestingModule({
      controllers: [ClinicalEncountersController],
      providers: [
        { provide: ClinicalEncountersService, useValue: mockService },
      ],
    })
      .overrideGuard(SupabaseAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ClinicalEncountersController>(ClinicalEncountersController);
  });

  afterEach(async () => {
    if (module) {
      await module.close();
    }
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createEncounter', () => {
    it('should call service with doctor user id', async () => {
      mockService.createEncounter.mockResolvedValue({ id: 'e-1' });
      const user = { appUser: { id: 'd-1', role: AppRole.DOCTOR } };
      const res = await controller.createEncounter('app-1', user);
      expect(res).toEqual({ id: 'e-1' });
      expect(mockService.createEncounter).toHaveBeenCalledWith('d-1', 'app-1');
    });
  });

  describe('startEncounter', () => {
    it('should call service', async () => {
      mockService.startEncounter.mockResolvedValue({ id: 'e-1' });
      const user = { appUser: { id: 'd-1', role: AppRole.DOCTOR } };
      const res = await controller.startEncounter('e-1', user);
      expect(res).toEqual({ id: 'e-1' });
      expect(mockService.startEncounter).toHaveBeenCalledWith('d-1', 'e-1');
    });
  });

  describe('completeEncounter', () => {
    it('should call service', async () => {
      mockService.completeEncounter.mockResolvedValue({ id: 'e-1' });
      const user = { appUser: { id: 'd-1', role: AppRole.DOCTOR } };
      const res = await controller.completeEncounter('e-1', user);
      expect(res).toEqual({ id: 'e-1' });
      expect(mockService.completeEncounter).toHaveBeenCalledWith('d-1', 'e-1');
    });
  });

  describe('cancelEncounter', () => {
    it('should call service', async () => {
      mockService.cancelEncounter.mockResolvedValue({ id: 'e-1' });
      const user = { appUser: { id: 'd-1', role: AppRole.DOCTOR } };
      const res = await controller.cancelEncounter('e-1', user);
      expect(res).toEqual({ id: 'e-1' });
      expect(mockService.cancelEncounter).toHaveBeenCalledWith('d-1', 'e-1');
    });
  });

  describe('getEncounter', () => {
    it('should call service with user and role', async () => {
      mockService.getEncounter.mockResolvedValue({ id: 'e-1' });
      const user = { appUser: { id: 'p-1', role: AppRole.PATIENT } };
      const res = await controller.getEncounter('e-1', user);
      expect(res).toEqual({ id: 'e-1' });
      expect(mockService.getEncounter).toHaveBeenCalledWith('p-1', AppRole.PATIENT, 'e-1');
    });
  });

  describe('getEncounterByAppointment', () => {
    it('should call service with user and role', async () => {
      mockService.getEncounterByAppointment.mockResolvedValue({ id: 'e-1' });
      const user = { appUser: { id: 'd-1', role: AppRole.DOCTOR } };
      const res = await controller.getEncounterByAppointment('app-1', user);
      expect(res).toEqual({ id: 'e-1' });
      expect(mockService.getEncounterByAppointment).toHaveBeenCalledWith('d-1', AppRole.DOCTOR, 'app-1');
    });
  });
});
