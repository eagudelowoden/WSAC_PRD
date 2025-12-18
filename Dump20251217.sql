CREATE DATABASE  IF NOT EXISTS `documentos_app` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;
USE `documentos_app`;
-- MySQL dump 10.13  Distrib 8.0.42, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: documentos_app
-- ------------------------------------------------------
-- Server version	8.0.42

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `notificaciones`
--

DROP TABLE IF EXISTS `notificaciones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notificaciones` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(100) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notificaciones`
--

LOCK TABLES `notificaciones` WRITE;
/*!40000 ALTER TABLE `notificaciones` DISABLE KEYS */;
INSERT INTO `notificaciones` VALUES (2,'danielpita868@gmail.com'),(1,'eagudelo@woden.com.co');
/*!40000 ALTER TABLE `notificaciones` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sessions`
--

DROP TABLE IF EXISTS `sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sessions` (
  `session_id` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `expires` int unsigned NOT NULL,
  `data` mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  PRIMARY KEY (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sessions`
--

LOCK TABLES `sessions` WRITE;
/*!40000 ALTER TABLE `sessions` DISABLE KEYS */;
INSERT INTO `sessions` VALUES ('G3pn0uV_cZFgNBIgokP9Yr6oAt0H8rwT',1765999896,'{\"cookie\":{\"originalMaxAge\":86400000,\"expires\":\"2025-12-17T18:58:14.623Z\",\"httpOnly\":true,\"path\":\"/\"},\"usuario\":{\"id\":4,\"nombre\":\"eagudelo\",\"rol\":\"aprobador\"}}'),('ToBJLof635_SXv0O7bDnIVyC4Hudu5pV',1765999924,'{\"cookie\":{\"originalMaxAge\":86399999,\"expires\":\"2025-12-17T19:14:15.707Z\",\"httpOnly\":true,\"path\":\"/\"},\"usuario\":{\"id\":3,\"nombre\":\"Elder Pita\",\"rol\":\"editor\"}}'),('eZ7Joa9kWlz4_9nLLHE9Lj_1thP-uGw3',1766061824,'{\"cookie\":{\"originalMaxAge\":86400000,\"expires\":\"2025-12-18T03:54:08.206Z\",\"httpOnly\":true,\"path\":\"/\"},\"usuario\":{\"id\":4,\"nombre\":\"eagudelo\",\"rol\":\"aprobador\"}}'),('gWn70i5KAcBPd3H5OwO-2Gj3PasAW_c7',1766019866,'{\"cookie\":{\"originalMaxAge\":86400000,\"expires\":\"2025-12-17T18:54:14.460Z\",\"httpOnly\":true,\"path\":\"/\"},\"usuario\":{\"id\":3,\"nombre\":\"Elder Pita\",\"rol\":\"editor\"}}');
/*!40000 ALTER TABLE `sessions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `usuarios`
--

DROP TABLE IF EXISTS `usuarios`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `usuarios` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombres` varchar(100) DEFAULT NULL,
  `apellidos` varchar(100) DEFAULT NULL,
  `documento` varchar(30) DEFAULT NULL,
  `telefono` varchar(30) DEFAULT NULL,
  `direccion` varchar(200) DEFAULT NULL,
  `correo` varchar(120) DEFAULT NULL,
  `fechaNacimiento` date DEFAULT NULL,
  `afiliaciones_familiares` varchar(200) DEFAULT NULL,
  `segmento_contrato` varchar(100) DEFAULT NULL,
  `descripcion_cargo` varchar(200) DEFAULT NULL,
  `otro_si` varchar(10) DEFAULT NULL,
  `afiliados_status` varchar(10) DEFAULT NULL,
  `tipo_contrato` varchar(100) DEFAULT NULL,
  `salario` decimal(15,2) DEFAULT NULL,
  `fecha_suscripcion` date DEFAULT NULL,
  `cargo` varchar(100) DEFAULT NULL,
  `ciudad` varchar(100) DEFAULT NULL,
  `afp` varchar(50) DEFAULT NULL,
  `eps` varchar(50) DEFAULT NULL,
  `arl` varchar(50) DEFAULT NULL,
  `ccf` varchar(50) DEFAULT NULL,
  `observaciones` text,
  `carpeta` varchar(200) DEFAULT NULL,
  `fechaRegistro` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `correoAprendizaje` varchar(120) DEFAULT NULL,
  `curso` varchar(150) DEFAULT NULL,
  `institucion` varchar(150) DEFAULT NULL,
  `nitInstitucion` varchar(50) DEFAULT NULL,
  `centroSena` varchar(150) DEFAULT NULL,
  `fechaterminacion` date DEFAULT NULL,
  `url_contrato_legado` text,
  `acuerdo_confidencialidad_url` text,
  `correoEnviadoFase1` varchar(10) DEFAULT NULL,
  `info_descripcion_cargo` text,
  `aprobacion` varchar(50) DEFAULT NULL,
  `segundaaprobacion` varchar(50) DEFAULT NULL,
  `motivoaprobacion` text,
  `token_subsanar` varchar(100) DEFAULT NULL,
  `fecha_solicitud_subsanar` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=47 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `usuarios`
--

LOCK TABLES `usuarios` WRITE;
/*!40000 ALTER TABLE `usuarios` DISABLE KEYS */;
INSERT INTO `usuarios` VALUES (45,'DANIEL ','AGUDELO','1003618766','3012195563','diagonal 36 sur','elderagudelo990@gmail.com','2025-12-15','SI 2','DIRECCIÓN TECNOLOGIA','DESARROLLADOR JUNIOR.pdf',NULL,NULL,NULL,23160000.00,NULL,'DESARROLLADOR JUNIOR','BOGOTA','POSITIVA','SURA','PRUEBAS','CONFAMA','','DANIEL  AGUDELO','2025-12-16 01:35:14',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'1',NULL,NULL,NULL,'2025-12-16 12:05:33'),(46,'OSCAR','VELASQUEZ','010230304505','3012195563','calle 12','osvelasquez@woden.com.co','2025-12-16','NO APLICA',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'CONFAMA','FAMISANAR','SURA','COMPENSAR',NULL,'OSCAR VELASQUEZ','2025-12-16 17:22:57',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'92aab0b0f4070e75bcba3021d4961a1d11035196','2025-12-16 12:23:51');
/*!40000 ALTER TABLE `usuarios` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `usuariossys`
--

DROP TABLE IF EXISTS `usuariossys`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `usuariossys` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) DEFAULT NULL,
  `usuario` varchar(50) NOT NULL,
  `password` varchar(255) NOT NULL,
  `rol` varchar(20) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `usuario` (`usuario`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `usuariossys`
--

LOCK TABLES `usuariossys` WRITE;
/*!40000 ALTER TABLE `usuariossys` DISABLE KEYS */;
INSERT INTO `usuariossys` VALUES (1,'Super Administrador','superadmin','$2b$10$bxqdVXxvP5XOuJXjjm4OPueFunfWP7dNGTQGQOkw8FiOeCiMBBzxW','superadmin'),(3,'Elder Pita','Epita','$2b$10$9NRYGSJJV6RgFHYWE7SkHu6xIybzYxjrnUMUcQJG6soxk4SSP3Nue','editor'),(4,'eagudelo','eagudelo','$2b$10$iH1cLQIQUW0nShi/TMy94e5TuWHYFKPnknwW5SB9ASYpFPLpf60E2','aprobador');
/*!40000 ALTER TABLE `usuariossys` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping events for database 'documentos_app'
--

--
-- Dumping routines for database 'documentos_app'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-12-17  7:52:38
