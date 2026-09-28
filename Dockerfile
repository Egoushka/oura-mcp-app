# The UI and server are bundled ahead of time (npm run build), so the image
# carries only dist/ and the production deps it still resolves at runtime.
FROM node:24-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY dist ./dist

ENV NODE_ENV=production PORT=5010 HOST=0.0.0.0
USER node
EXPOSE 5010
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:5010/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
