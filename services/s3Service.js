// Archivo: services/s3Service.js
require('dotenv').config(); // <--- Carga las variables AWS_...

const { S3Client, PutObjectCommand, DeleteObjectCommand, CopyObjectCommand } = require("@aws-sdk/client-s3");

// 1. VERIFICACIÓN DE VARIABLES (Mira la consola al guardar)
console.log("--- DEBUG AWS S3 ---");
console.log("Region:", process.env.AWS_REGION ? `✅ ${process.env.AWS_REGION}` : "❌ Falta AWS_REGION");
console.log("Bucket:", process.env.AWS_BUCKET_NAME ? `✅ ${process.env.AWS_BUCKET_NAME}` : "❌ Falta AWS_BUCKET_NAME");
console.log("Access Key:", process.env.AWS_ACCESS_KEY_ID ? "✅ Cargado" : "❌ Falta AWS_ACCESS_KEY_ID");
console.log("Secret Key:", process.env.AWS_SECRET_ACCESS_KEY ? "✅ Cargado" : "❌ Falta AWS_SECRET_ACCESS_KEY");
console.log("--------------------");

// 2. CONFIGURACIÓN PARA AWS S3 ORIGINAL
const s3Client = new S3Client({
    region: process.env.AWS_REGION, // Ej: us-east-1
    // Nota: En AWS S3 normal NO se suele poner 'endpoint' manual, el SDK lo deduce por la región.
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

async function subirArchivo(buffer, carpetaUsuario, nombreArchivo, mimeType) {
    // Definimos la ruta dentro del Bucket: carpeta/archivo.docx
    const key = `${carpetaUsuario}/${nombreArchivo}`;

    const command = new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        // ACL: 'public-read' // Descomenta si tu bucket permite ACLs públicas y quieres acceso directo
    });

    try {
        await s3Client.send(command);
        console.log(`✅ Archivo subido a AWS S3: ${key}`);

        // Construimos la URL pública estándar de AWS S3
        // Formato: https://NOMBRE_BUCKET.s3.REGION.amazonaws.com/CARPETA/ARCHIVO
        const url = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

        return { key, url }; 
    } catch (error) {
        console.error("❌ Error subiendo a AWS S3:", error);
        throw error;
    }
}
//Ajustes
async function eliminarArchivo(key) {
    const command = new DeleteObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: key
    });

    try {
        await s3Client.send(command);
        console.log(`🗑️ Archivo eliminado de S3: ${key}`);
        return true;
    } catch (error) {
        console.error("❌ Error eliminando de S3:", error);
        throw error;
    }
}

// CORRECTO (Exporta AMBAS funciones)
module.exports = { subirArchivo, eliminarArchivo, s3Client, CopyObjectCommand, PutObjectCommand };