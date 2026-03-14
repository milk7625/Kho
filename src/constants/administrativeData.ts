export interface AdministrativeUnit {
  province_code: string;
  province_name: string;
  province_ascii: string;
  district_name: string;
  district_ascii: string;
  commune_name: string;
  commune_ascii: string;
}

// Dữ liệu mẫu đại diện cho file mapping
export const ADMINISTRATIVE_UNITS: AdministrativeUnit[] = [
  { province_code: "89", province_name: "An Giang", province_ascii: "An Giang", district_name: "An Phú", district_ascii: "An Phu", commune_name: "An Phú", commune_ascii: "An Phu" },
  { province_code: "89", province_name: "An Giang", province_ascii: "An Giang", district_name: "An Phú", district_ascii: "An Phu", commune_name: "Đa Phước", commune_ascii: "Da Phuoc" },
  { province_code: "89", province_name: "An Giang", province_ascii: "An Giang", district_name: "Châu Đốc", district_ascii: "Chau Doc", commune_name: "Núi Sam", commune_ascii: "Nui Sam" },
  { province_code: "77", province_name: "Bà Rịa - Vũng Tàu", province_ascii: "Ba Ria - Vung Tau", district_name: "Bà Rịa", district_ascii: "Ba Ria", commune_name: "Hoà Long", commune_ascii: "Hoa Long" },
  { province_code: "01", province_name: "Hà Nội", province_ascii: "Ha Noi", district_name: "Ba Đình", district_ascii: "Ba Dinh", commune_name: "Cống Vị", commune_ascii: "Cong Vi" },
  { province_code: "79", province_name: "Hồ Chí Minh", province_ascii: "Ho Chi Minh", district_name: "Quận 1", district_ascii: "Quan 1", commune_name: "Bến Nghé", commune_ascii: "Ben Nghe" },
  { province_code: "22", province_name: "Quảng Ninh", province_ascii: "Quang Ninh", district_name: "Tiên Yên", district_ascii: "Tien Yen", commune_name: "", commune_ascii: "" },
  { province_code: "37", province_name: "Ninh Bình", province_ascii: "Ninh Binh", district_name: "Nho Quan", district_ascii: "Nho Quan", commune_name: "", commune_ascii: "" },
  { province_code: "51", province_name: "Quảng Ngãi", province_ascii: "Quang Ngai", district_name: "Sơn Hà", district_ascii: "Son Ha", commune_name: "", commune_ascii: "" },
  { province_code: "36", province_name: "Nam Định", province_ascii: "Nam Dinh", district_name: "Xuân Trường", district_ascii: "Xuan Truong", commune_name: "", commune_ascii: "" },
  { province_code: "34", province_name: "Thái Bình", province_ascii: "Thai Binh", district_name: "Vũ Thư", district_ascii: "Vu Thu", commune_name: "", commune_ascii: "" },
  { province_code: "64", province_name: "Gia Lai", province_ascii: "Gia Lai", district_name: "An Khê", district_ascii: "An Khe", commune_name: "", commune_ascii: "" },
  // ... Có thể mở rộng thêm từ file CSV của người dùng
];
