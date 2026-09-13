"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Loader2, AlertCircle, CheckCircle2, ScanSearch } from "lucide-react";
import { analyzeIncident, type AnalyzeResult } from "@/app/actions/analyze";

const springConfig = { type: "spring" as const, stiffness: 400, damping: 30 };

export default function IncidentReporter() {
  const [file, setFile] = useState<File | null>(null);
  const [previewURL, setPreviewURL] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setPreviewURL(URL.createObjectURL(selected));
      setResult(null); 
    }
  };

  const handleAnalyze = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!file) return;
    
    setIsAnalyzing(true);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    let lat = 0;
    let lng = 0;

    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
      });
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
      formData.append("lat", lat.toString());
      formData.append("lng", lng.toString());
    } catch (locErr) {
      console.log("Location access denied or failed, proceeding without location.");
    }

    try {
      const { analyzeIncident } = await import('@/app/actions/analyze');
      const aiResult = await analyzeIncident(formData);
      setResult(aiResult);

      // Сохраняем в localStorage для Дашборда Ремонтника
      if (!aiResult.error) {
        const reader = new FileReader();
        reader.onload = async (e) => {
          const base64 = e.target?.result as string;
          const newIncident = {
            id: `REQ-${Math.floor(100 + Math.random() * 900)}`,
            address: lat && lng ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : "Локация неизвестна",
            lat: lat,
            lng: lng,
            scale: aiResult.scale,
            probability: aiResult.probability,
            status: "Новая",
            time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
            img: base64
          };
          
          // Сохраняем заявку на сервере
          const { saveIncident } = await import('@/app/actions/db');
          await saveIncident(newIncident);
        };
        reader.readAsDataURL(file);
      }

    } catch (error) {
      console.error(error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col gap-5">
      
      {/* Премиальная зона загрузки (Linear/Vercel style) */}
      <motion.div 
        className="relative group cursor-pointer"
        whileTap={{ scale: 0.995 }}
        transition={springConfig}
        onClick={() => !isAnalyzing && fileInputRef.current?.click()}
      >
        <div className={`
          bg-white rounded-3xl p-2 shadow-sm border-2 border-dashed transition-colors duration-200
          ${isAnalyzing ? 'border-slate-200' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}
        `}>
          <div className="relative overflow-hidden rounded-2xl flex flex-col items-center justify-center min-h-[320px] text-center bg-slate-50/50">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileSelect} 
              accept="image/*" 
              className="hidden" 
            />
            
            <AnimatePresence mode="wait">
              {previewURL ? (
                <motion.div 
                  key="preview"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 w-full h-full"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewURL} alt="Предпросмотр" className="w-full h-full object-cover" />
                  
                  {/* Кнопка отмены (удалить выбранное фото до анализа) */}
                  {!isAnalyzing && !result && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                        setPreviewURL(null);
                        setResult(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="absolute top-4 right-4 w-8 h-8 bg-black/50 hover:bg-black/70 backdrop-blur-md text-white rounded-full flex items-center justify-center transition-colors"
                      title="Удалить фото"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                    </button>
                  )}

                  {/* Bounding Box (разметка ИИ) */}
                  {result?.box_2d && result.box_2d[2] > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="absolute border-4 border-red-500 bg-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.5)] flex flex-col justify-start"
                      style={{
                        top: `${result.box_2d[0]}%`,
                        left: `${result.box_2d[1]}%`,
                        height: `${result.box_2d[2] - result.box_2d[0]}%`,
                        width: `${result.box_2d[3] - result.box_2d[1]}%`,
                      }}
                    >
                      <div className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 absolute -top-5 left-[-4px] whitespace-nowrap">
                        Обнаружена аномалия ({result.probability}%)
                      </div>
                    </motion.div>
                  )}

                  {/* Мягкий градиент внизу для читаемости кнопки */}
                  <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-slate-900/60 to-transparent pointer-events-none" />
                  
                  <div className="absolute inset-0 flex items-end justify-center pb-8">
                    {!isAnalyzing ? (
                      <motion.button 
                        onClick={handleAnalyze}
                        className="px-6 py-3 bg-slate-900 text-white rounded-full font-medium shadow-button transition-all flex items-center gap-2 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.96 }}
                      >
                        <ScanSearch size={18} />
                        Анализировать нейросетью
                      </motion.button>
                    ) : (
                      <div className="flex items-center gap-2 px-6 py-3 bg-white/90 backdrop-blur-sm text-slate-900 rounded-full font-medium shadow-sm border border-slate-200">
                        <Loader2 size={16} className="animate-spin text-blue-600" />
                        Анализ данных...
                      </div>
                    )}
                  </div>
                </motion.div>
              ) : (
                <motion.div 
                  key="placeholder"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-3 text-slate-500"
                >
                  <div className="w-12 h-12 rounded-xl bg-white text-slate-400 flex items-center justify-center border border-slate-200 shadow-sm mb-2 group-hover:text-slate-600 transition-colors">
                    <Camera size={20} />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-slate-900 mb-0.5">Сделать фото</p>
                    <p className="text-sm">Нажмите, чтобы открыть камеру или выбрать файл</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {/* Строгая карточка результата */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={springConfig}
            className="bg-white rounded-2xl p-6 shadow-premium border border-slate-200"
          >
            {result.error ? (
              <div className="flex items-start gap-3 text-red-600">
                <AlertCircle className="shrink-0 mt-0.5" size={20} />
                <div>
                  <h3 className="font-semibold text-sm">Ошибка анализа</h3>
                  <p className="text-sm opacity-90 mt-1">{result.error}</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-50 text-green-600 flex items-center justify-center border border-green-100">
                      <CheckCircle2 size={16} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900 text-sm">Анализ завершён</h3>
                      <p className="text-xs text-slate-500">Gemini 3.5 Flash</p>
                    </div>
                  </div>
                  
                  <div className="text-right flex items-center gap-3">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Вероятность
                    </div>
                    <div className="text-3xl font-bold tracking-tight text-blue-600">
                      {result.probability}%
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 md:col-span-1">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Уровень риска</div>
                    <div className="font-semibold text-slate-900">{result.scale}</div>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 md:col-span-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Вердикт Нейросети</div>
                    <p className="text-sm text-slate-700 leading-relaxed">{result.description}</p>
                  </div>
                </div>

                <div className="pt-2">
                  <button 
                    onClick={() => {
                      setFile(null);
                      setPreviewURL(null);
                      setResult(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-medium transition-colors"
                  >
                    Сделать новое фото
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
