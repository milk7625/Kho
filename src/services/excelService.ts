import * as XLSX from 'xlsx';
import { ADMINISTRATIVE_UNITS } from '../constants/administrativeData';

export interface ProcessedRow {
  [key: string]: any;
  _rowHash?: string;
}

export class ExcelService {
  /**
   * Chuẩn hóa văn bản tiếng Việt không dấu
   */
  static normalizeText(text: string): string {
    if (!text) return "";
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Tạo mã hash đơn giản cho một dòng dữ liệu để chống trùng
   */
  static generateRowHash(row: any): string {
    const values = Object.values(row).map(v => String(v).trim()).join('|');
    // Sử dụng một hàm băm đơn giản (trong thực tế nên dùng MD5/SHA)
    let hash = 0;
    for (let i = 0; i < values.length; i++) {
      const char = values.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }

  /**
   * Nhận diện thông tin từ tên file (ID, Huyện, Tỉnh, Phiên bản)
   */
  static parseFilename(filename: string): { id: string | null, district: string | null, province: string | null, version: string | null } {
    const stem = filename.split('.')[0];
    
    // Regex để bắt các thành phần: [Số] [Tên Địa Danh] [(Số)]
    // Ví dụ: 900 Tiên Yên Quảng Ninh (2)
    const idMatch = stem.match(/^(\d+)\s+/);
    const id = idMatch ? idMatch[1] : null;
    
    const versionMatch = stem.match(/\((\d+)\)$/);
    const version = versionMatch ? versionMatch[1] : null;
    
    let remaining = stem;
    if (id) remaining = remaining.replace(id, "").trim();
    if (version) remaining = remaining.replace(`(${version})`, "").trim();
    
    // Bây giờ remaining còn lại "Tiên Yên Quảng Ninh"
    // Chúng ta sẽ thử khớp với danh sách tỉnh thành
    const provinces = Array.from(new Set(ADMINISTRATIVE_UNITS.map(u => u.province_name)));
    let province = null;
    let district = null;
    
    // Tìm tỉnh trước (thường ở cuối)
    for (const p of provinces) {
      if (remaining.toLowerCase().endsWith(p.toLowerCase())) {
        province = p;
        district = remaining.substring(0, remaining.length - p.length).trim();
        break;
      }
    }
    
    // Nếu không tìm thấy tỉnh bằng endsWith, thử tìm trong chuỗi
    if (!province) {
      for (const p of provinces) {
        if (remaining.toLowerCase().includes(p.toLowerCase())) {
          province = p;
          // Giả định phần trước tỉnh là huyện
          const parts = remaining.split(new RegExp(p, 'i'));
          district = parts[0].trim();
          break;
        }
      }
    }

    // Nếu vẫn không thấy, dùng logic cũ cho province
    if (!province) {
      province = this.guessProvinceFromFilename(filename);
    }

    return { id, district, province, version };
  }

  /**
   * Nhận diện tỉnh thành dựa trên tên file
   */
  static guessProvinceFromFilename(filename: string): string | null {
    const stem = filename.split('.')[0];
    const normStem = this.normalizeText(stem).replace(/\s+/g, "");
    if (!normStem) return null;

    // Lấy danh sách các tỉnh duy nhất
    const provinces = Array.from(new Set(ADMINISTRATIVE_UNITS.map(u => u.province_name)));
    
    let bestMatch = null;
    let maxLen = 0;

    for (const province of provinces) {
      const normProv = this.normalizeText(province).replace(/\s+/g, "");
      if (normStem.includes(normProv)) {
        if (normProv.length > maxLen) {
          maxLen = normProv.length;
          bestMatch = province;
        }
      }
    }

    return bestMatch;
  }

  /**
   * Kiểm tra xem một dòng dữ liệu có khớp với từ khóa không (không dấu, không phân biệt hoa thường)
   */
  static matchesKeyword(row: any, keyword: string): boolean {
    if (!keyword) return true;
    const normKey = this.normalizeText(keyword);
    const rowValues = Object.values(row).join(" ");
    const normRow = this.normalizeText(rowValues);
    return normRow.includes(normKey);
  }

  /**
   * Tìm kiếm thông tin hành chính chi tiết dựa trên từ khóa
   */
  static searchAdministrativeUnit(keyword: string) {
    const normKey = this.normalizeText(keyword);
    if (!normKey || normKey.length < 2) return null;

    const matches: any[] = [];

    for (const unit of ADMINISTRATIVE_UNITS) {
      const commune = this.normalizeText(unit.commune_ascii);
      const district = this.normalizeText(unit.district_ascii);
      const province = this.normalizeText(unit.province_ascii);

      // Ưu tiên khớp chính xác
      if (normKey === commune || normKey === district || normKey === province) {
        return {
          type: normKey === commune ? 'Xã/Phường' : (normKey === district ? 'Quận/Huyện' : 'Tỉnh/Thành'),
          name: normKey === commune ? unit.commune_name : (normKey === district ? unit.district_name : unit.province_name),
          district: unit.district_name,
          province: unit.province_name,
          full: `${unit.commune_name}, ${unit.district_name}, ${unit.province_name}`
        };
      }

      // Khớp một phần
      if (commune.includes(normKey) || district.includes(normKey) || province.includes(normKey)) {
        matches.push({
          type: commune.includes(normKey) ? 'Xã/Phường' : (district.includes(normKey) ? 'Quận/Huyện' : 'Tỉnh/Thành'),
          name: commune.includes(normKey) ? unit.commune_name : (district.includes(normKey) ? unit.district_name : unit.province_name),
          district: unit.district_name,
          province: unit.province_name,
          full: `${unit.commune_name}, ${unit.district_name}, ${unit.province_name}`
        });
      }
    }

    return matches.length > 0 ? matches[0] : null;
  }

  /**
   * Tìm kiếm tỉnh thành dựa trên từ khóa
   */
  static resolveProvince(keyword: string): string | null {
    const normKey = this.normalizeText(keyword);
    if (!normKey) return null;

    let bestMatch = null;
    let maxScore = 0;

    for (const unit of ADMINISTRATIVE_UNITS) {
      const commune = this.normalizeText(unit.commune_ascii);
      const district = this.normalizeText(unit.district_ascii);
      const province = this.normalizeText(unit.province_ascii);

      if (normKey === commune) return unit.province_name;
      if (normKey === district) return unit.province_name;
      if (normKey === province) return unit.province_name;

      // Điểm cộng nếu chứa từ khóa
      if (commune.includes(normKey)) {
        const score = normKey.length / commune.length;
        if (score > maxScore) {
          maxScore = score;
          bestMatch = unit.province_name;
        }
      }
    }

    return bestMatch;
  }

  /**
   * Đọc file Excel và trả về mảng dữ liệu
   */
  static async readExcel(file: File): Promise<ProcessedRow[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const json = XLSX.utils.sheet_to_json(worksheet);
          resolve(json as ProcessedRow[]);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Xuất dữ liệu ra file Excel
   */
  static exportToExcel(data: any[], fileName: string) {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
    XLSX.writeFile(workbook, `${fileName}.xlsx`);
  }

  /**
   * Trích xuất số điện thoại từ dữ liệu
   */
  static extractPhones(data: any[]): string[] {
    const phones: string[] = [];
    const phoneRegex = /(0[3|5|7|8|9])+([0-9]{8})\b/g;

    data.forEach(row => {
      Object.values(row).forEach(val => {
        const str = String(val);
        const matches = str.match(phoneRegex);
        if (matches) {
          phones.push(...matches);
        }
      });
    });

    return Array.from(new Set(phones)); // Loại bỏ trùng lặp trong mẻ xuất này
  }
}
