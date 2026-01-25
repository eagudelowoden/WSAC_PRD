import pandas as pd
import mysql.connector
from mysql.connector import Error
import numpy as np  # Importación necesaria para manejar nulos correctamente

# ==========================================
# 1. CONFIGURACIÓN
# ==========================================
DB_CONFIG = {
    'host': 'dbwoden-aurora-cluster.cluster-cyeyhpu1wzr0.us-east-2.rds.amazonaws.com',
    'user': 'usrwdsa',
    'password': 'Wd2019**',
    'database': 'dbdocumentos_wsac'
}

ARCHIVO_EXCEL = 'Respuestas.xlsx'

def migrar_datos():
    print("🚀 Iniciando lectura del Excel...")
    try:
        # Cargamos el excel
        df = pd.read_excel(ARCHIVO_EXCEL)
        
        # LIMPIEZA DEFINITIVA: 
        # Convertimos cualquier tipo de valor nulo (NaN, NaT, None) a None de Python
        df = df.replace({np.nan: None, pd.NA: None, pd.NaT: None})
        
    except Exception as e:
        print(f"❌ Error al leer Excel: {e}")
        return

    def clean_val(val, default=None):
        """Limpia el valor para que no sea un objeto nulo de pandas"""
        if val is None or str(val).lower() == 'nan' or str(val).strip() == '':
            return default
        return str(val).strip()

    def clean_int(val, default=0):
        """Asegura que el valor sea un número entero"""
        try:
            if val is None or str(val).lower() == 'nan': 
                return default
            return int(float(val))
        except:
            return default

    def formatear_fecha(valor):
        if valor is None or str(valor).lower() == 'nan':
            return None
        try:
            return pd.to_datetime(valor).strftime('%Y-%m-%d')
        except:
            return None

    print(f"📄 Registros encontrados: {len(df)}. Conectando a BD...")

    try:
        connection = mysql.connector.connect(**DB_CONFIG)
        cursor = connection.cursor()
        
        insertados = 0
        errores = 0

        for index, row in df.iterrows():
            try:
                # Datos básicos
                nombres = clean_val(row.get('Nombres Completos'), '')
                apellidos = clean_val(row.get('Apellidos Completos'), '')
                documento = clean_val(row.get('Documento de Identidad'))
                
                if not documento:
                    continue

                carpeta = f"{nombres} {apellidos}".strip()

                sql = """
                INSERT INTO usuarios (
                    nombres, apellidos, documento, telefono, direccion, correo, 
                    fechaNacimiento, eps, arl, afp, ccf, afiliaciones_familiares,
                    tipo_contrato, salario, observaciones, aprobacion, segundaaprobacion, 
                    motivoaprobacion, cargo, fecha_suscripcion, ciudad,
                    correoAprendizaje  , curso, institucion, nitInstitucion, centroSena, fechaterminacion,
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
                    %s, %s, %s, %s
                )
                """

                valores = (
                    nombres, apellidos, documento,
                    clean_val(row.get('Numero de teléfono'), ''),
                    clean_val(row.get('Dirección de Residencia')),
                    clean_val(row.get('Correo Electrónico')),
                    formatear_fecha(row.get('Fecha Nacimiento')),
                    clean_val(row.get('EPS')),
                    clean_val(row.get('ARL')),
                    clean_val(row.get('AFP')),
                    clean_val(row.get('CCF')),
                    clean_val(row.get('Afiliaciones de Familiares')),
                    clean_val(row.get('contrato')),
                    clean_int(row.get('salario')),
                    clean_val(row.get('observaciones')),
                    clean_val(row.get('aprobacion')),
                    clean_val(row.get('segundaaprobacion')),
                    clean_val(row.get('motivoaprobacion')),
                    clean_val(row.get('cargo')),
                    formatear_fecha(row.get('FechaSuscripcion')),
                    clean_val(row.get('ciudad')),
                    clean_val(row.get('correoAprendizaje  ')),
                    clean_val(row.get('curso')),
                    clean_val(row.get('institucion')),
                    clean_val(row.get('nitInstitucion')),
                    clean_val(row.get('centroSena')),
                    formatear_fecha(row.get('fechaterminacion')),
                    clean_val(row.get('descripcion_del_cargo')),
                    clean_val(row.get('otro_si'), '0'),
                    clean_val(row.get('URL_Contrato')),
                    clean_val(row.get('segmento_del_cargo')),
                    clean_val(row.get('info_descripcion_cargo')),
                    clean_val(row.get('correoEnviadoFase1'), 'NO'),
                    clean_val(row.get('acuerdo_confidencialidad_url')),
                    carpeta
                )

                cursor.execute(sql, valores)
                insertados += 1
                print(f"✅ Fila {index+2}: {carpeta}")

            except Error as e:
                print(f"❌ Error en fila {index + 2}: {e}")
                errores += 1

        connection.commit()
        print(f"\n🚀 Finalizado. Éxito: {insertados}, Error: {errores}")

    except Error as e:
        print(f"❌ Error de conexión: {e}")
    finally:
        if 'connection' in locals() and connection.is_connected():
            cursor.close()
            connection.close()

if __name__ == "__main__":
    migrar_datos()