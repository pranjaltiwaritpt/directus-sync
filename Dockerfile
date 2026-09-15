FROM directus/directus:11

USER node
RUN npm install directus-extension-sync