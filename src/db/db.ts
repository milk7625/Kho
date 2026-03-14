import Dexie, { Table } from 'dexie';

export interface ExcelFile {
  id?: number;
  name: string;
  province: string;
  rowCount: number;
  uploadDate: number;
}

export interface ExcelRow {
  id?: number;
  fileId: number;
  province: string;
  data: any;
  hash: string;
}

export interface UsedHash {
  hash: string;
  usedAt: number;
}

export class CutterDatabase extends Dexie {
  files!: Table<ExcelFile>;
  rows!: Table<ExcelRow>;
  usedHashes!: Table<UsedHash>;

  constructor() {
    super('CutterExcelDB');
    this.version(1).stores({
      files: '++id, name, province',
      rows: '++id, fileId, province, hash',
      usedHashes: 'hash'
    });
  }
}

export const db = new CutterDatabase();
