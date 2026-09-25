import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { CreateMedicalRecordDto } from './dto/create-medical-record.dto.js';
import { UpdateMedicalRecordDto } from './dto/update-medical-record.dto.js';
import { CreateMedicalDocumentUploadUrlDto } from './dto/create-medical-document-upload-url.dto.js';
import { randomUUID } from 'crypto';

import { AuditService } from '../audit/audit.service.js';
import { MedicalDataAccessService } from '../medical-data-access/medical-data-access.service.js';

@Injectable()
export class MedicalRecordsService {
  private readonly SIGNED_URL_EXPIRES_IN = 300; // 5 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly dataAccess: MedicalDataAccessService,
  ) {}

  // --- PATIENT: Medical Records ---

  async createRecord(patientUserId: string, dto: CreateMedicalRecordDto) {
    const patient = await this.getPatientOrThrow(patientUserId);

    const record = await this.prisma.medicalRecord.create({
      data: {
        patient_id: patient.id,
        title: dto.title,
        description: dto.description,
      },
      select: this.recordSelect(),
    });
    
    // Ideally use transaction, but createRecord doesn't have it easily without moving select. 
    // Prisma create is safe enough to follow with audit.
    await this.audit.logEvent(
      this.prisma,
      patientUserId,
      'PATIENT',
      'MEDICAL_RECORD_CREATED',
      'MedicalRecord',
      record.id,
      patient.id
    );

    return record;
  }

  async getRecords(patientUserId: string, page = 1, limit = 20) {
    const patient = await this.getPatientOrThrow(patientUserId);
    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      this.prisma.medicalRecord.count({
        where: { patient_id: patient.id, status: 'ACTIVE' },
      }),
      this.prisma.medicalRecord.findMany({
        where: { patient_id: patient.id, status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: this.recordSelect(),
      }),
    ]);

    return {
      data,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
    };
  }

  async getRecordById(patientUserId: string, recordId: string) {
    const patient = await this.getPatientOrThrow(patientUserId);
    const record = await this.prisma.medicalRecord.findFirst({
      where: { id: recordId, patient_id: patient.id, status: 'ACTIVE' },
      select: this.recordSelect(),
    });

    if (!record) throw new NotFoundException('Medical record not found');

    await this.audit.logEvent(
      this.prisma,
      patientUserId,
      'PATIENT',
      'MEDICAL_RECORD_VIEWED',
      'MedicalRecord',
      record.id,
      patient.id
    );

    return record;
  }

  async updateRecord(patientUserId: string, recordId: string, dto: UpdateMedicalRecordDto) {
    const patient = await this.getPatientOrThrow(patientUserId);
    const record = await this.prisma.medicalRecord.findFirst({
      where: { id: recordId, patient_id: patient.id, status: 'ACTIVE' },
    });

    if (!record) throw new NotFoundException('Medical record not found');

    const updated = await this.prisma.medicalRecord.update({
      where: { id: record.id },
      data: {
        title: dto.title,
        description: dto.description,
      },
      select: this.recordSelect(),
    });

    await this.audit.logEvent(
      this.prisma,
      patientUserId,
      'PATIENT',
      'MEDICAL_RECORD_UPDATED',
      'MedicalRecord',
      updated.id,
      patient.id
    );

    return updated;
  }

  async deleteRecord(patientUserId: string, recordId: string) {
    const patient = await this.getPatientOrThrow(patientUserId);
    const record = await this.prisma.medicalRecord.findFirst({
      where: { id: recordId, patient_id: patient.id, status: 'ACTIVE' },
    });

    if (!record) throw new NotFoundException('Medical record not found');

    // Soft delete record. We don't cascade physically, but documents become orphaned logically.
    // It's better to also soft-delete documents.
    await this.prisma.$transaction(async (tx) => {
      await tx.medicalRecord.update({
        where: { id: record.id },
        data: { status: 'DELETED' },
      });
      await tx.medicalDocument.updateMany({
        where: { medical_record_id: record.id },
        data: { status: 'DELETED' },
      });
      await this.audit.logEvent(tx, patientUserId, 'PATIENT', 'MEDICAL_RECORD_DELETED', 'MedicalRecord', record.id, patient.id);
    });

    return { message: 'Medical record and its documents deactivated successfully' };
  }

  // --- PATIENT: Medical Documents ---

  async createDocumentUploadUrl(
    patientUserId: string,
    recordId: string,
    dto: CreateMedicalDocumentUploadUrlDto,
  ) {
    const patient = await this.getPatientOrThrow(patientUserId);
    const record = await this.prisma.medicalRecord.findFirst({
      where: { id: recordId, patient_id: patient.id, status: 'ACTIVE' },
    });

    if (!record) throw new NotFoundException('Medical record not found');

    const documentId = randomUUID();
    const extension = dto.original_filename.split('.').pop() || '';
    const safeFilename = `${documentId}.${extension}`;
    const storagePath = `patients/${patient.id}/records/${record.id}/${safeFilename}`;

    // Create DB entry as PENDING until confirmed
    const document = await this.prisma.medicalDocument.create({
      data: {
        id: documentId,
        medical_record_id: record.id,
        original_filename: dto.original_filename,
        storage_object_path: storagePath,
        mime_type: dto.mime_type,
        file_size_bytes: dto.file_size_bytes,
        uploaded_by_user_id: patientUserId,
        status: 'PENDING',
      },
    });

    const uploadUrl = await this.storage.createSignedUploadUrl(storagePath);

    return {
      upload_url: uploadUrl,
      document: {
        id: document.id,
        original_filename: document.original_filename,
        mime_type: document.mime_type,
        file_size_bytes: document.file_size_bytes,
        status: document.status,
      },
    };
  }

  async completeDocumentUpload(patientUserId: string, documentId: string) {
    const patient = await this.getPatientOrThrow(patientUserId);
    const document = await this.prisma.medicalDocument.findFirst({
      where: {
        id: documentId,
        status: 'PENDING',
        medicalRecord: {
          patient_id: patient.id,
          status: 'ACTIVE',
        },
      },
    });

    if (!document) {
      throw new NotFoundException('Pending document not found or already active/deleted');
    }

    const exists = await this.storage.verifyObjectExists(document.storage_object_path);
    
    if (!exists) {
      // Document remains PENDING. Fail closed.
      throw new ConflictException('Storage object verification failed. Cannot activate document.');
    }
    
    const updated = await this.prisma.$transaction(async (tx) => {
      const doc = await tx.medicalDocument.update({
        where: { id: document.id },
        data: { status: 'ACTIVE' },
        select: this.documentSelect(),
      });
      await this.audit.logEvent(tx, patientUserId, 'PATIENT', 'MEDICAL_DOCUMENT_UPLOADED', 'MedicalDocument', document.id, patient.id);
      return doc;
    });

    return updated;
  }

  async getDocuments(patientUserId: string, recordId: string, page = 1, limit = 20) {
    const patient = await this.getPatientOrThrow(patientUserId);
    const record = await this.prisma.medicalRecord.findFirst({
      where: { id: recordId, patient_id: patient.id, status: 'ACTIVE' },
    });

    if (!record) throw new NotFoundException('Medical record not found');

    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      this.prisma.medicalDocument.count({
        where: { medical_record_id: record.id, status: 'ACTIVE' },
      }),
      this.prisma.medicalDocument.findMany({
        where: { medical_record_id: record.id, status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: this.documentSelect(),
      }),
    ]);

    return {
      data,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
    };
  }

  async getDownloadUrlForPatient(patientUserId: string, documentId: string) {
    const patient = await this.getPatientOrThrow(patientUserId);
    const document = await this.prisma.medicalDocument.findFirst({
      where: {
        id: documentId,
        status: 'ACTIVE',
        medicalRecord: {
          patient_id: patient.id,
          status: 'ACTIVE',
        },
      },
    });

    if (!document) throw new NotFoundException('Medical document not found');

    const downloadUrl = await this.storage.createSignedDownloadUrl(
      document.storage_object_path,
      this.SIGNED_URL_EXPIRES_IN,
    );

    await this.audit.logEvent(this.prisma, patientUserId, 'PATIENT', 'MEDICAL_DOCUMENT_DOWNLOAD_URL_CREATED', 'MedicalDocument', document.id, patient.id);

    return { download_url: downloadUrl, expires_in_seconds: this.SIGNED_URL_EXPIRES_IN };
  }

  async deleteDocument(patientUserId: string, documentId: string) {
    const patient = await this.getPatientOrThrow(patientUserId);
    const document = await this.prisma.medicalDocument.findFirst({
      where: {
        id: documentId,
        status: 'ACTIVE',
        medicalRecord: {
          patient_id: patient.id,
          status: 'ACTIVE',
        },
      },
    });

    if (!document) throw new NotFoundException('Medical document not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.medicalDocument.update({
        where: { id: document.id },
        data: { status: 'DELETED' },
      });
      await this.audit.logEvent(tx, patientUserId, 'PATIENT', 'MEDICAL_DOCUMENT_DELETED', 'MedicalDocument', document.id, patient.id);
    });

    return { message: 'Document deactivated successfully' };
  }

  // --- DOCTOR ACCESS ---

  private async verifyDoctorAccessToPatient(doctorUserId: string, targetPatientUserId: string) {
    const doctor = await this.getDoctorOrThrow(doctorUserId);
    const targetPatient = await this.getPatientOrThrow(targetPatientUserId);

    // Doctor can only access if there is an explicit ACTIVE grant
    const hasAccess = await this.dataAccess.verifyDoctorAccess(doctor.id, targetPatient.id);

    if (!hasAccess) {
      // Keep throwing ForbiddenException to match existing test expectations
      throw new ForbiddenException('No established clinical relationship with this patient.');
    }

    return { targetPatient, doctor };
  }

  async getRecordsForDoctor(doctorUserId: string, patientUserId: string, page = 1, limit = 20) {
    const { targetPatient: patient, doctor } = await this.verifyDoctorAccessToPatient(doctorUserId, patientUserId);
    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      this.prisma.medicalRecord.count({
        where: { patient_id: patient.id, status: 'ACTIVE' },
      }),
      this.prisma.medicalRecord.findMany({
        where: { patient_id: patient.id, status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: this.recordSelect(),
      }),
    ]);

    await this.audit.logEvent(this.prisma, doctorUserId, 'DOCTOR', 'MEDICAL_RECORD_VIEWED', 'MedicalRecord', null, patient.id);

    return {
      data,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
    };
  }

  async getDocumentsForDoctor(
    doctorUserId: string,
    patientUserId: string,
    recordId: string,
    page = 1,
    limit = 20,
  ) {
    const { targetPatient: patient, doctor } = await this.verifyDoctorAccessToPatient(doctorUserId, patientUserId);
    const record = await this.prisma.medicalRecord.findFirst({
      where: { id: recordId, patient_id: patient.id, status: 'ACTIVE' },
    });

    if (!record) throw new NotFoundException('Medical record not found');

    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      this.prisma.medicalDocument.count({
        where: { medical_record_id: record.id, status: 'ACTIVE' },
      }),
      this.prisma.medicalDocument.findMany({
        where: { medical_record_id: record.id, status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: this.documentSelect(),
      }),
    ]);

    await this.audit.logEvent(this.prisma, doctorUserId, 'DOCTOR', 'MEDICAL_DOCUMENT_VIEWED', 'MedicalRecord', record.id, patient.id);

    return {
      data,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
    };
  }

  async getDownloadUrlForDoctor(
    doctorUserId: string,
    patientUserId: string,
    documentId: string,
  ) {
    const { targetPatient: patient, doctor } = await this.verifyDoctorAccessToPatient(doctorUserId, patientUserId);
    const document = await this.prisma.medicalDocument.findFirst({
      where: {
        id: documentId,
        status: 'ACTIVE',
        medicalRecord: {
          patient_id: patient.id,
          status: 'ACTIVE',
        },
      },
    });

    if (!document) throw new NotFoundException('Medical document not found');

    const downloadUrl = await this.storage.createSignedDownloadUrl(
      document.storage_object_path,
      this.SIGNED_URL_EXPIRES_IN,
    );

    await this.audit.logEvent(this.prisma, doctorUserId, 'DOCTOR', 'MEDICAL_DOCUMENT_DOWNLOAD_URL_CREATED', 'MedicalDocument', document.id, patient.id);

    return { download_url: downloadUrl, expires_in_seconds: this.SIGNED_URL_EXPIRES_IN };
  }

  // --- HELPERS ---

  private async getPatientOrThrow(userId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { user_id: userId },
    });
    if (!patient) throw new NotFoundException('Patient profile not found.');
    return patient;
  }

  private async getDoctorOrThrow(userId: string) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { user_id: userId, verification_status: 'VERIFIED' },
    });
    if (!doctor) throw new ForbiddenException('Doctor is not verified or profile not found.');
    return doctor;
  }

  private recordSelect() {
    return {
      id: true,
      title: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: { documents: { where: { status: 'ACTIVE' } } },
      },
    };
  }

  private documentSelect() {
    return {
      id: true,
      original_filename: true,
      mime_type: true,
      file_size_bytes: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    };
  }
}
