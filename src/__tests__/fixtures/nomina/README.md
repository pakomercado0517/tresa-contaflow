# Fixtures CFDI Nómina (complemento nomina12)

XMLs de **prueba** para el parser de nómina. Estructura válida según complemento 1.2 del SAT; **no están timbrados ni firmados** (UUID y sellos son sintéticos).

| Archivo | Descripción |
|---------|-------------|
| `nomina-minimal.xml` | CFDI 4.0: una percepción (sueldo), dos deducciones (IMSS, ISR). |
| `nomina-percepciones-deducciones.xml` | Varias percepciones (sueldo, vales, aguinaldo) y deducciones. |
| `nomina-otros-pagos.xml` | Incluye `nomina12:OtrosPagos` (subsidio al empleo). |
| `nomina-horas-extra.xml` | Percepción tipo 019 (Horas extra) con nodo `nomina12:HorasExtra`. |
| `nomina-v33.xml` | Misma lógica en CFDI 3.3 (sin Exportacion/ObjetoImp/DomicilioFiscalReceptor). |

**Uso:** Cargar con `fs.readFileSync(path, 'utf-8')` o `Buffer.from(xmlString)` en tests del parser de nómina.
