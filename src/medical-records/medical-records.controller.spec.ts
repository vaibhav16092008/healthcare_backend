import { Test, TestingModule } from '@nestjs/testing';
import { 
  PatientMedicalRecordsController,
  PatientMedicalDocumentsController,
  DoctorMedicalRecordsController
} from './medical-records.controller.js';
import { MedicalRecordsService } from './medical-records.service.js';
import { SupabaseAuthGuard } from '../auth/supabase.guard.js';
import { RolesGuard } from '../auth/roles/roles.guard.js';
import { vi } from 'vitest';

describe('MedicalRecordsControllers', () => {
  let patientRecordsCtrl: PatientMedicalRecordsController;
  let doctorRecordsCtrl: DoctorMedicalRecordsController;
  let service: MedicalRecordsService;

  beforeEach(async () => {
    const mockService = {
      createRecord: vi.fn(),
      getRecords: vi.fn(),
      getRecordById: vi.fn(),
      getRecordsForDoctor: vi.fn(),
      createDocumentUploadUrl: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [
        PatientMedicalRecordsController,
        PatientMedicalDocumentsController,
        DoctorMedicalRecordsController
      ],
      providers: [
        { provide: MedicalRecordsService, useValue: mockService }
      ]
    })
      .overrideGuard(SupabaseAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    patientRecordsCtrl = module.get<PatientMedicalRecordsController>(PatientMedicalRecordsController);
    doctorRecordsCtrl = module.get<DoctorMedicalRecordsController>(DoctorMedicalRecordsController);
    service = module.get<MedicalRecordsService>(MedicalRecordsService);
  });

  it('Patient should call createRecord on service', async () => {
    const fakeUser = { appUser: { id: 'u-1' } };
    await patientRecordsCtrl.createRecord(fakeUser, { title: 'Test' });
    expect(service.createRecord).toHaveBeenCalledWith('u-1', { title: 'Test' });
  });

  it('Doctor should call getRecordsForDoctor on service', async () => {
    const fakeUser = { appUser: { id: 'doc-1' } };
    await doctorRecordsCtrl.getRecordsForDoctor(fakeUser, 'pat-1', 1, 20);
    expect(service.getRecordsForDoctor).toHaveBeenCalledWith('doc-1', 'pat-1', 1, 20);
  });
});
