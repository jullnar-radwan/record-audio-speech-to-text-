# ========== Build minimal image ==========
FROM node:18-alpine

WORKDIR /app
COPY package.json package-lock.json* /app/
RUN npm ci --omit=dev

COPY server.js /app/
# نخدم أيضاً ملفات client كـ static عبر Express
WORKDIR /app
# عند التشغيل سنحتاج مجلد client من أعلى المسار
# لذا في خطوة النشر انسخ الريبو كاملاً ضمن الحاوية أو استخدم bind mount محلياً

# بيئة التشغيل
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
