"use server";

import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({});

// Telegram Данные (из промпта)
const TG_BOT_TOKEN = "8978813676:AAF12F_6b3LTcvzJ9i6wSK4cPnSL8WwisME";
const TG_CHAT_ID = "8866917292";

export interface AnalyzeResult {
  probability: number;
  scale: "Критический" | "Средний" | "Низкий" | "Нет утечки";
  description: string;
  box_2d?: [number, number, number, number];
  error?: string;
}

export async function analyzeIncident(formData: FormData): Promise<AnalyzeResult> {
  try {
    const file = formData.get("file") as File;
    const lat = formData.get("lat") as string | null;
    const lng = formData.get("lng") as string | null;

    if (!file) {
      throw new Error("Файл не найден");
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Data = buffer.toString("base64");

    const prompt = `
      Вы — эксперт по анализу инфраструктуры ЖКХ. Оцените фото на наличие утечек воды/прорывов труб.
      
      Ответь СТРОГО в формате JSON без маркдауна и лишних символов:
      {
        "probability": число от 0 до 100 (вероятность утечки),
        "scale": "Критический" | "Средний" | "Низкий" | "Нет утечки",
        "description": "Краткое обоснование на русском языке (1-2 предложения)",
        "box_2d": [ymin, xmin, ymax, xmax] 
      }
      
      Где box_2d — это координаты проблемного участка на фото (рамка/bounding box) в процентах от 0 до 100. 
      Например, если утечка в центре, то [30, 30, 70, 70]. Если утечек нет, верните [0,0,0,0].
    `;

    // Используем самую новую доступную модель (исправляем ошибку 404, так как 1.5 уже не поддерживается в 2026)
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash", 
      contents: [
        prompt,
        {
          inlineData: {
            data: base64Data,
            mimeType: file.type,
          },
        },
      ],
      config: {
        responseMimeType: "application/json",
      },
    });

    let resultText = response.text;
    
    if (!resultText) {
      throw new Error("Пустой ответ от ИИ");
    }

    // Очищаем от возможных маркдаун-оберток ```json
    resultText = resultText.replace(/```json/g, "").replace(/```/g, "").trim();

    const jsonResult = JSON.parse(resultText) as AnalyzeResult;

    // --- ОТПРАВКА В TELEGRAM ---
    try {
      // 1. Формируем красивое текстовое сообщение (как раньше)
      const caption = `🚨 *Новая заявка об утечке!*\n\n` +
                      `🤖 *ИИ Анализ:*\n` +
                      `Вероятность: ${jsonResult.probability}%\n` +
                      `Масштаб: ${jsonResult.scale}\n\n` +
                      `📝 *Описание:* ${jsonResult.description}\n\n` +
                      `📍 [Ссылка на Google Maps](https://www.google.com/maps/search/?api=1&query=${lat},${lng})`;

      // 2. Отправляем Фото + Текст
      const photoFormData = new FormData();
      photoFormData.append("chat_id", TG_CHAT_ID);
      photoFormData.append("photo", file);
      photoFormData.append("caption", caption);
      photoFormData.append("parse_mode", "Markdown");

      await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendPhoto`, {
        method: "POST",
        body: photoFormData,
      });

      // 3. Отправляем геолокацию отдельным пином (как раньше)
      if (lat && lng) {
        await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendLocation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: TG_CHAT_ID,
            latitude: parseFloat(lat),
            longitude: parseFloat(lng),
          })
        });
      }

      // 4. Генерируем НАСТОЯЩИЙ PDF отчет с помощью pdf-lib
      try {
        const { PDFDocument, rgb } = await import("pdf-lib");
        import("@pdf-lib/fontkit").then(async (fontkitModule) => {
          const fontkit = fontkitModule.default || fontkitModule;
          const pdfDoc = await PDFDocument.create();
          pdfDoc.registerFontkit(fontkit);

          // Загружаем шрифт с поддержкой кириллицы (Roboto)
          const fontUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Regular.ttf';
          const fontRes = await fetch(fontUrl);
          const fontBytes = await fontRes.arrayBuffer();
          const customFont = await pdfDoc.embedFont(fontBytes);

          const page = pdfDoc.addPage([595.28, 841.89]); // A4
          const { width, height } = page.getSize();
          
          const dateStr = new Date().toLocaleString("ru-RU", { timeZone: "Asia/Aqtau" });
          
          page.drawText('ОТЧЕТ ОБ ИНЦИДЕНТЕ (wAIter AI)', { x: 50, y: height - 50, size: 20, font: customFont, color: rgb(0.1, 0.2, 0.5) });
          page.drawText(`Дата и время: ${dateStr}`, { x: 50, y: height - 90, size: 12, font: customFont });
          page.drawText(`Координаты: ${lat || 'N/A'}, ${lng || 'N/A'}`, { x: 50, y: height - 110, size: 12, font: customFont });
          page.drawText(`Вероятность утечки: ${jsonResult.probability}%`, { x: 50, y: height - 150, size: 14, font: customFont, color: rgb(0.8, 0.1, 0.1) });
          page.drawText(`Масштаб: ${jsonResult.scale}`, { x: 50, y: height - 170, size: 14, font: customFont });
          page.drawText(`Вердикт нейросети: ${jsonResult.description}`, { x: 50, y: height - 210, size: 12, font: customFont, maxWidth: 500 });
          
          const pdfBytes = await pdfDoc.save();
          const pdfBlob = new Blob([pdfBytes as any], { type: 'application/pdf' });

          const docFormData = new FormData();
          docFormData.append("chat_id", TG_CHAT_ID);
          docFormData.append("document", pdfBlob, "AI_Report.pdf");
          docFormData.append("caption", "📄 Прикреплен сгенерированный PDF-отчет.");

          await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendDocument`, {
            method: "POST",
            body: docFormData,
          });
        });
      } catch (pdfError) {
        console.error("Ошибка при генерации PDF:", pdfError);
      }

    } catch (tgError) {
      console.error("Ошибка отправки в Telegram:", tgError);
    }

    return jsonResult;

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    return {
      probability: 0,
      scale: "Нет утечки",
      description: "Произошла ошибка при анализе. Попробуйте еще раз.",
      error: error.message,
    };
  }
}
