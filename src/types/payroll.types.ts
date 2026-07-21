export interface UploadPayrollParams {
  userId: string;
  profileId: string;
  periodId: string;
  xmlBuffer: Buffer;
}

export interface ListPayrollsParams {
  userId: string;
  profileId?: string;
  periodId?: string;
}

export interface PayrollByIdParams {
  userId: string;
  payrollId: string;
}
