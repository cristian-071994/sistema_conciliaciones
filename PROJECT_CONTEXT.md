PROJECT_CONTEXT.md: Sistema de Conciliación - COINTRA S.A.S.
1. Propósito del Sistema
El sistema tiene como objetivo centralizar y automatizar la conciliación de servicios de transporte y logística prestados por terceros para Cointra S.A.S.
. El sistema gestiona viajes, peajes, horas extras y otros servicios adicionales
.
2. Lógica de Negocio (Modelo Intermediario)
Cointra actúa como un operador logístico intermediario
.
Contratación: El Cliente contrata a Cointra; Cointra subcontrata a un Tercero (transportador)
.
Rentabilidad: Es la diferencia entre lo que Cointra cobra al Cliente y lo que le paga al Tercero
.
Fórmula Base: Tarifa Tercero = Tarifa Cliente × (1 − % Rentabilidad Cointra)
.
Confidencialidad: El diferencial de rentabilidad es información crítica y confidencial, visible únicamente para el rol "Cointra"
.
3. Actores y Seguridad de Datos (Requerimiento No Negociable)
El sistema debe garantizar una visibilidad restringida por rol para proteger la rentabilidad
:
Actor
Visibilidad Financiera
Tercero (Transportador)
Solo ve la Tarifa Tercero (lo que Cointra le paga)
.
Cliente (Dueño de carga)
Solo ve la Tarifa Cliente (lo que negoció con Cointra)
.
Cointra
Visibilidad Total: Tarifa Cliente, Tarifa Tercero y % Rentabilidad
.
4. Flujo de Estados de la Conciliación
Los ítems a conciliar deben transitar por los siguientes estados obligatorios
:
PENDIENTE: Cargado por el Tercero o Cointra; pendiente de ajuste de tarifas
.
EN REVISIÓN: Cointra aplicó rentabilidad y el Cliente está revisando para aprobar o rechazar
.
APROBADO: El Cliente validó los ítems. Se genera autorización para facturar
.
CERRADO: Registro finalizado y archivado en historial
.
5. Integraciones y Validaciones
API Avansat: El sistema debe consultar esta API externa para validar que los viajes reportados por terceros coincidan con manifiestos de transporte reales (placa, origen, destino) y que no hayan sido facturados previamente
.
Facturación: El sistema no genera facturas electrónicas; solo registra la autorización para que el proceso ocurra en sistemas externos
.
6. Módulos Funcionales
Viajes: Conciliación principal vinculada a manifiestos de Avansat
.
Peajes: Módulo independiente; Cointra carga y el Cliente autoriza (sin manifiesto)
.
Adicionales: Horas extras, relevos, viajes extras; con flujo de aprobación propio
.
Tabla de Tarifas: Configuración del % de rentabilidad por operación o cliente
.
7. Restricciones Técnicas (RNF)
Carga Masiva: Procesar archivos Excel de hasta 1,000 filas en menos de 5 segundos
.
Trazabilidad: Todo cambio de tarifa o estado debe registrar usuario, fecha y hora
.
Interfaz: Web, multidispositivo y con indicadores visuales (colores) por estado
.