import React, { useState, useCallback } from 'react';
import { 
  FileSpreadsheet, 
  Upload, 
  Search, 
  Trash2, 
  Download, 
  ShieldCheck, 
  History,
  AlertCircle,
  Database,
  Loader2,
  FileText,
  CheckCircle2,
  XCircle,
  MapPin,
  Eye,
  X,
  ChevronRight,
  Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLiveQuery } from 'dexie-react-hooks';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { db } from './db/db';
import { ExcelService } from './services/excelService';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [rowsToExport, setRowsToExport] = useState(1000);
  const [logs, setLogs] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [searchKey, setSearchKey] = useState('');
  const [searchResult, setSearchResult] = useState<any>(null);
  
  // New states for the adjusted workflow
  const [selectedProvince, setSelectedProvince] = useState<string>('');
  const [filterKeyword, setFilterKeyword] = useState('');
  const [filteredRows, setFilteredRows] = useState<any[]>([]);
  const [availableCount, setAvailableCount] = useState(0);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  
  // Modal states
  const [showFileModal, setShowFileModal] = useState(false);
  const [modalProvince, setModalProvince] = useState<string | null>(null);
  const [provinceFiles, setProvinceFiles] = useState<any[]>([]);

  // Live queries from IndexedDB
  const files = useLiveQuery(() => db.files.toArray());
  const usedCount = useLiveQuery(() => db.usedHashes.count());

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));
  }, []);

  // Effect to handle dynamic filtering and counting
  React.useEffect(() => {
    const updateFilteredData = async () => {
      if (!selectedProvince) {
        setFilteredRows([]);
        setAvailableCount(0);
        return;
      }

      setIsPreviewLoading(true);
      try {
        // Get rows for this province
        const rows = await db.rows.where('province').equals(selectedProvince).toArray();
        
        // Filter by keyword and check if used
        const filtered = [];
        for (const row of rows) {
          const isUsed = await db.usedHashes.get(row.hash);
          if (!isUsed && ExcelService.matchesKeyword(row.data, filterKeyword)) {
            filtered.push(row);
          }
        }
        
        setAvailableCount(filtered.length);
        setFilteredRows(filtered.slice(0, 20).map(r => r.data));
      } catch (err) {
        console.error("Filter error:", err);
      } finally {
        setIsPreviewLoading(false);
      }
    };

    const timer = setTimeout(updateFilteredData, 300);
    return () => clearTimeout(timer);
  }, [selectedProvince, filterKeyword, usedCount]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles) return;

    setIsProcessing(true);
    setUploadProgress({ current: 0, total: uploadedFiles.length });

    for (let i = 0; i < uploadedFiles.length; i++) {
      const file = uploadedFiles[i];
      setUploadProgress(prev => ({ ...prev, current: i + 1 }));
      
      try {
        addLog(`Đang xử lý: ${file.name}...`);
        
        // Use Web Worker for parsing
        const worker = new Worker(new URL('./workers/excelWorker.ts', import.meta.url), { type: 'module' });
        
        const { province, district } = ExcelService.parseFilename(file.name);
        const finalProvince = province || "Chưa xác định";
        
        const result = await new Promise<any>((resolve, reject) => {
          worker.onmessage = (e) => {
            if (e.data.type === 'DONE') resolve(e.data);
            else if (e.data.type === 'ERROR') reject(e.data.error);
          };
          worker.postMessage({ file, province: finalProvince });
        });

        // Save metadata
        const fileId = await db.files.add({
          name: file.name,
          province: finalProvince,
          rowCount: result.total,
          uploadDate: Date.now()
        });

        // Save rows in bulk to IndexedDB
        const rowsToSave = result.rows.map((r: any) => ({
          fileId,
          province,
          data: r.data,
          hash: r.hash
        }));

        // Batch insert to avoid UI lock
        const batchSize = 10000;
        for (let j = 0; j < rowsToSave.length; j += batchSize) {
          await db.rows.bulkAdd(rowsToSave.slice(j, j + batchSize));
        }

        addLog(`Đã nạp ${file.name} (${result.total} dòng) vào kho ${province}.`);
        worker.terminate();
      } catch (err) {
        addLog(`Lỗi khi xử lý ${file.name}: ${err}`);
      }
    }
    
    setIsProcessing(false);
    setUploadProgress({ current: 0, total: 0 });
    e.target.value = '';
  };

  const handleExport = async () => {
    if (!selectedProvince) {
      addLog("Lỗi: Vui lòng chọn tỉnh thành.");
      return;
    }

    setIsProcessing(true);
    addLog(`Đang trích xuất dữ liệu cho ${selectedProvince} với từ khóa "${filterKeyword}"...`);

    try {
      const rows = await db.rows.where('province').equals(selectedProvince).toArray();
      const pickedRows: any[] = [];
      const newUsedHashes: any[] = [];
      
      for (const row of rows) {
        const isUsed = await db.usedHashes.get(row.hash);
        if (!isUsed && ExcelService.matchesKeyword(row.data, filterKeyword)) {
          pickedRows.push(row.data);
          newUsedHashes.push({ hash: row.hash, usedAt: Date.now() });
          if (pickedRows.length >= rowsToExport) break;
        }
      }

      if (pickedRows.length === 0) {
        addLog("Lỗi: Không tìm thấy dữ liệu phù hợp hoặc đã trùng hết.");
      } else {
        const fileName = `${selectedProvince}_${filterKeyword || 'All'}_${pickedRows.length}_rows_${Date.now()}`;
        ExcelService.exportToExcel(pickedRows, fileName);
        
        await db.usedHashes.bulkAdd(newUsedHashes);
        addLog(`Thành công: Đã xuất ${pickedRows.length} dòng.`);
      }
    } catch (err) {
      addLog(`Lỗi khi xuất: ${err}`);
    }
    
    setIsProcessing(false);
  };

  const openFileModal = async (province: string) => {
    const files = await db.files.where('province').equals(province).toArray();
    setProvinceFiles(files);
    setModalProvince(province);
    setShowFileModal(true);
  };

  const handleSearchUnit = (val: string) => {
    setSearchKey(val);
    if (val.trim().length >= 2) {
      setSearchResult(ExcelService.searchAdministrativeUnit(val));
    } else {
      setSearchResult(null);
    }
  };

  const clearHistory = async () => {
    if (window.confirm("Bạn có chắc chắn muốn xóa toàn bộ lịch sử chống trùng?")) {
      await db.usedHashes.clear();
      addLog("Đã xóa sạch kho dữ liệu chống trùng.");
    }
  };

  const clearInventory = async () => {
    if (window.confirm("Xóa toàn bộ kho dữ liệu (Files & Rows)?")) {
      await db.files.clear();
      await db.rows.clear();
      addLog("Đã dọn dẹp kho dữ liệu.");
    }
  };

  // Group files by province for display
  const provinceStats = files?.reduce((acc, file) => {
    if (!acc[file.province]) acc[file.province] = { count: 0, rows: 0 };
    acc[file.province].count += 1;
    acc[file.province].rows += file.rowCount;
    return acc;
  }, {} as Record<string, { count: number, rows: number }>) || {};

  return (
    <div className="min-h-screen bg-[#0B0E14] text-slate-200 font-sans p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <FileSpreadsheet className="text-white w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Cutter Excel CW <span className="text-indigo-400 text-xs bg-indigo-400/10 px-2 py-0.5 rounded ml-2 uppercase">Pro</span></h1>
              <p className="text-slate-500 text-sm font-medium">High-Performance Engine (IndexedDB + Workers)</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="px-4 py-2 bg-slate-800/50 rounded-lg border border-white/5 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-mono">{(usedCount || 0).toLocaleString()} hashes</span>
            </div>
            <button 
              onClick={clearHistory}
              className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
              title="Xóa lịch sử chống trùng"
            >
              <History className="w-5 h-5" />
            </button>
            <button 
              onClick={clearInventory}
              className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
              title="Dọn dẹp kho"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          <div className="lg:col-span-4 space-y-6">
            <section className="bg-[#141824] rounded-2xl border border-white/5 p-5 shadow-xl">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
                <Upload className="w-4 h-4" /> Nạp dữ liệu {uploadProgress.total > 0 && `(${uploadProgress.current}/${uploadProgress.total})`}
              </h2>
              <label className="group relative flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-700 rounded-xl hover:border-indigo-500 hover:bg-indigo-500/5 transition-all cursor-pointer">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  {isProcessing ? (
                    <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-2" />
                  ) : (
                    <Upload className="w-8 h-8 text-slate-500 group-hover:text-indigo-400 mb-2 transition-colors" />
                  )}
                  <p className="text-sm text-slate-400">Kéo thả hàng trăm file Excel</p>
                </div>
                <input 
                  type="file" 
                  className="hidden" 
                  multiple 
                  accept=".xlsx,.xls,.csv" 
                  onChange={handleFileUpload}
                  disabled={isProcessing}
                />
              </label>
            </section>

            <section className="bg-[#141824] rounded-2xl border border-white/5 p-5 shadow-xl space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-2">
                <Download className="w-4 h-4" /> Cấu hình xuất
              </h2>
              
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 ml-1">Chọn Tỉnh/Thành</label>
                <select 
                  value={selectedProvince}
                  onChange={(e) => setSelectedProvince(e.target.value)}
                  className="w-full bg-[#0E1016] border border-white/5 rounded-xl py-2.5 px-4 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                >
                  <option value="">-- Chọn tỉnh --</option>
                  {Object.keys(provinceStats).map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 ml-1">Lọc theo Xã/Huyện (Từ khóa)</label>
                <div className="relative">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input 
                    type="text"
                    value={filterKeyword}
                    onChange={(e) => setFilterKeyword(e.target.value)}
                    placeholder="Ví dụ: Tien Yen, Nho Quan..."
                    className="w-full bg-[#0E1016] border border-white/5 rounded-xl py-2.5 pl-10 pr-4 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                  />
                </div>
              </div>

              <div className="p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-xl flex items-center justify-between">
                <span className="text-xs text-slate-400">Dữ liệu khả dụng:</span>
                <span className="text-sm font-bold text-indigo-400">{availableCount.toLocaleString()} dòng</span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 ml-1">Số lượng muốn cắt</label>
                <input 
                  type="number"
                  value={rowsToExport}
                  onChange={(e) => setRowsToExport(parseInt(e.target.value) || 0)}
                  className="w-full bg-[#0E1016] border border-white/5 rounded-xl py-2.5 px-4 focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-mono"
                />
              </div>

              <button 
                onClick={handleExport}
                disabled={isProcessing || !selectedProvince || availableCount === 0}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2"
              >
                {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                Xác nhận cắt dữ liệu
              </button>
            </section>

            <section className="bg-[#141824] rounded-2xl border border-white/5 p-5 shadow-xl">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
                <MapPin className="w-4 h-4" /> Tra cứu địa danh
              </h2>
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input 
                    type="text"
                    value={searchKey}
                    onChange={(e) => handleSearchUnit(e.target.value)}
                    placeholder="Nhập tên Xã hoặc Huyện..."
                    className="w-full bg-[#0E1016] border border-white/5 rounded-xl py-2.5 pl-10 pr-4 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                  />
                </div>
                {searchResult && (
                  <div className="p-3 bg-indigo-500/5 rounded-xl border border-indigo-500/10 space-y-2 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Kết quả:</span>
                      <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-400 rounded text-[10px] font-bold uppercase">{searchResult.type}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Tên:</span>
                      <span className="font-bold text-slate-200">{searchResult.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Huyện:</span>
                      <span className="font-medium text-slate-300">{searchResult.district}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Tỉnh:</span>
                      <span className="font-bold text-emerald-400">{searchResult.province}</span>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="bg-[#141824] rounded-2xl border border-white/5 p-5 shadow-xl flex flex-col">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" /> Nhật ký
              </h2>
              <div className="flex-1 overflow-y-auto font-mono text-[10px] space-y-1 pr-2 scrollbar-thin scrollbar-thumb-slate-700 h-40">
                {logs.map((log, i) => (
                  <div key={i} className="py-1 border-b border-white/5 text-slate-400">{log}</div>
                ))}
              </div>
            </section>
          </div>

          <div className="lg:col-span-8 space-y-6">
            <section className="bg-[#141824] rounded-2xl border border-white/5 shadow-xl overflow-hidden flex flex-col h-[400px]">
              <div className="p-5 border-b border-white/5 flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                  <Eye className="w-4 h-4" /> Xem trước mẫu (20 dòng đầu)
                </h2>
                {isPreviewLoading && <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />}
              </div>
              <div className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-slate-700">
                {filteredRows.length > 0 ? (
                  <table className="w-full text-[10px] text-left border-collapse">
                    <thead className="sticky top-0 bg-[#141824] z-10">
                      <tr className="text-slate-500 font-bold uppercase border-b border-white/5">
                        {Object.keys(filteredRows[0]).map(key => (
                          <th key={key} className="px-4 py-2 whitespace-nowrap">{key}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredRows.map((row, i) => (
                        <tr key={i} className="hover:bg-white/[0.02]">
                          {Object.values(row).map((val: any, j) => (
                            <td key={j} className="px-4 py-2 text-slate-400 truncate max-w-[150px]">{String(val)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600 italic">
                    <Search className="w-8 h-8 mb-2 opacity-20" />
                    <p>Chọn tỉnh và nhập từ khóa để xem trước dữ liệu</p>
                  </div>
                )}
              </div>
            </section>

            <section className="bg-[#141824] rounded-2xl border border-white/5 shadow-xl overflow-hidden flex flex-col min-h-[300px]">
              <div className="p-5 border-b border-white/5 flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                  <Database className="w-4 h-4" /> Kho dữ liệu (IndexedDB)
                </h2>
                <div className="flex gap-2">
                  <span className="text-xs font-bold px-2 py-1 bg-slate-800 text-slate-400 rounded-md">
                    {files?.length || 0} files
                  </span>
                </div>
              </div>
              
              <div className="flex-1 overflow-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-[#141824] z-10">
                    <tr className="text-slate-500 text-xs font-bold uppercase border-b border-white/5">
                      <th className="px-6 py-4">Tỉnh Thành</th>
                      <th className="px-6 py-4">Files</th>
                      <th className="px-6 py-4">Tổng Dòng</th>
                      <th className="px-6 py-4 text-right">Hành động</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {Object.entries(provinceStats).length === 0 ? (
                      <tr><td colSpan={4} className="px-6 py-20 text-center text-slate-600 italic">Kho trống</td></tr>
                    ) : (
                      Object.entries(provinceStats).map(([name, stat]) => (
                        <tr key={name} className={cn("hover:bg-white/[0.02]", selectedProvince === name && "bg-indigo-500/5")}>
                          <td className="px-6 py-4 font-bold text-slate-200">{name}</td>
                          <td className="px-6 py-4">
                            <button 
                              onClick={() => openFileModal(name)}
                              className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium underline underline-offset-4"
                            >
                              {stat.count} files <ChevronRight className="w-3 h-3" />
                            </button>
                          </td>
                          <td className="px-6 py-4 font-mono text-indigo-400">{stat.rows.toLocaleString()}</td>
                          <td className="px-6 py-4 text-right">
                            <button 
                              onClick={() => setSelectedProvince(name)}
                              className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded uppercase font-bold hover:bg-emerald-500/20 transition-colors"
                            >
                              Chọn tỉnh
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </main>
      </div>

      {/* File List Modal */}
      <AnimatePresence>
        {showFileModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#141824] border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-4 border-b border-white/5 flex items-center justify-between bg-slate-800/30">
                <div className="flex items-center gap-3">
                  <Database className="w-5 h-5 text-indigo-400" />
                  <h3 className="font-bold text-white">Danh sách file gốc: {modalProvince}</h3>
                </div>
                <button onClick={() => setShowFileModal(false)} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-slate-500 text-[10px] font-bold uppercase border-b border-white/5">
                      <th className="px-4 py-2">Tên file</th>
                      <th className="px-4 py-2">Số dòng</th>
                      <th className="px-4 py-2 text-right">Ngày nạp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {provinceFiles.map((file) => (
                      <tr key={file.id} className="hover:bg-white/[0.02] text-xs">
                        <td className="px-4 py-3 text-slate-200 font-medium">{file.name}</td>
                        <td className="px-4 py-3 text-indigo-400 font-mono">{file.rowCount.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-slate-500">
                          {new Date(file.uploadDate).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-4 border-top border-white/5 bg-slate-800/30 flex justify-end">
                <button 
                  onClick={() => setShowFileModal(false)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-bold rounded-lg transition-colors"
                >
                  Đóng
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
