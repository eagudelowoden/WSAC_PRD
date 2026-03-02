import pandas as pd
import mysql.connector
from mysql.connector import Error

# ==========================================
# 1. CONFIGURACIÓN
# ==========================================
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',          # TU USUARIO
    'password': 'root',          # TU CONTRASEÑA
    'database': 'documentos_app'     # TU BASE DE DATOS
}

ARCHIVO_EXCEL = 'Respuestas.xlsx' # El nombre de tu archivo

# ==========================================
# 2. PROCESO DE MIGRACIÓN
# ==========================================
def migrar_datos():
    print("🚀 Iniciando lectura del Excel con Pandas...")

    # Leemos el Excel
    try:
        df = pd.read_excel(ARCHIVO_EXCEL)
    except FileNotFoundError:
        print(f"❌ Error: No encuentro el archivo '{ARCHIVO_EXCEL}'")
        return

    # --- LIMPIEZA DE DATOS (PANDAS MAGIC) ---
    
    # 1. Rellenar vacíos (NaN) con None para que MySQL no se queje
    df = df.where(pd.notnull(df), None)

    # 2. Función auxiliar para fechas
    def formatear_fecha(valor):
        if pd.isna(valor) or valor == '':
            return None
        try:
            return pd.to_datetime(valor).strftime('%Y-%m-%d')
        except:
            return None

    print(f"📄 Se encontraron {len(df)} registros. Conectando a BD...")

    try:
        connection = mysql.connector.connect(**DB_CONFIG)
        cursor = connection.cursor()
        
        insertados = 0
        errores = 0

        for index, row in df.iterrows():
            try:
                # Validar Cédula (Obligatorio)
                if not row.get('Documento de Identidad'):
                    continue

                # --- GENERAR CARPETA ---
                nombres = str(row.get('Nombres Completos', '')).strip()
                apellidos = str(row.get('Apellidos Completos', '')).strip()
                carpeta = f"{nombres} {apellidos}"

                # --- PREPARAR QUERY ---
                sql = """
                INSERT INTO usuarios (
                    nombres, apellidos, documento, telefono, direccion, correo, 
                    fechaNacimiento, eps, arl, afp, ccf, afiliaciones_familiares,
                    
                    tipo_contrato, salario, observaciones, aprobacion, segundaaprobacion, 
                    motivoaprobacion, cargo, fecha_suscripcion, ciudad,
                    
                    correoAprendizaje, curso, institucion, nitInstitucion, centroSena, fechaterminacion,
                    
                    descripcion_cargo, otro_si, url_contrato_legado, segmento_contrato, 
                    info_descripcion_cargo, correoEnviadoFase1, acuerdo_confidencialidad_url,
                    
                    carpeta
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, 
                    %s, %s, %s, %s, %s, %s,
                    
                    %s, %s, %s, %s, %s, 
                    %s, %s, %s, %s,
                    
                    %s, %s, %s, %s, %s, %s,
                    
                    %s, %s, %s, %s, 
                    %s, %s, %s,
                    
                    %s
                )
                """

                # --- MAPEO DE VALORES ---
                valores = (
                    nombres,
                    apellidos,
                    str(row.get('Documento de Identidad', '')),
                    str(row.get('Numero de teléfono', '')),
                    row.get('Dirección de Residencia'),
                    row.get('Correo Electrónico'),
                    formatear_fecha(row.get('Fecha Nacimiento')),
                    row.get('EPS'),
                    row.get('ARL'),
                    row.get('AFP'),
                    row.get('CCF'),
                    row.get('Afiliaciones de Familiares'),

                    row.get('contrato'),          # tipo_contrato
                    row.get('salario', 0),
                    row.get('observaciones'),
                    row.get('aprobacion'),
                    row.get('segundaaprobacion'),
                    row.get('motivoaprobacion'),
                    row.get('cargo'),
                    formatear_fecha(row.get('FechaSuscripcion')),
                    row.get('ciudad'),

                    row.get('correoAprendizaje'),
                    row.get('curso'),
                    row.get('institucion'),
                    row.get('nitInstitucion'),
                    row.get('centroSena'),
                    formatear_fecha(row.get('fechaterminacion')),

                    row.get('descripcion_del_cargo'),
                    str(row.get('otro_si', '')),
                    row.get('URL_Contrato'),
                    row.get('segmento_del_cargo'),
                    row.get('info_descripcion_cargo'),
                    str(row.get('correoEnviadoFase1', '')),
                    row.get('acuerdo_confidencialidad_url'),

                    carpeta # Campo calculado
                )

                cursor.execute(sql, valores)
                insertados += 1
                print(f"✅ Insertado: {nombres} {apellidos}")

            except Error as e:
                print(f"❌ Error en fila {index + 2}: {e}")
                errores += 1

        connection.commit()
        print("\n" + "="*40)
        print(f"🏁 RESUMEN FINAL")
        print(f"✅ Exitosos: {insertados}")
        print(f"❌ Fallidos: {errores}")
        print("="*40)

    except Error as e:
        print(f"Error conectando a MySQL: {e}")
    finally:
        if connection.is_connected():
            cursor.close()
            connection.close()

if __name__ == "__main__":
    migrar_datos()