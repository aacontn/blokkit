# Plan: Sistema de Gestión BloKKit (ERP)

> Elaborado 2026-06-12 a partir de: auditoría de brechas del sistema actual,
> rescate del cotizador original (`/Users/alfonso/Desktop/Blokkit/Cotizaciones/`)
> e investigación de facturación electrónica chilena con API.
> Visión: el portal como sistema operativo completo del negocio —
> ventas, operaciones, finanzas y marketing — sobre la base ya construida
> (Supabase + React + Cloudflare).

## Hallazgos clave de la investigación

1. **🚨 El formulario de contacto del sitio está ROTO en producción**: hace
   POST a `/api/contact` y ese endpoint no existe (Astro es estático, no hay
   Pages Function). El visitante ve "No pudimos enviar la solicitud" y el
   lead SE PIERDE. Único canal vivo: WhatsApp. → Arreglo inmediato en Fase 0.
2. **El cotizador original existe y está bueno**: `cotizador_blokkit.html`
   (Desktop/Blokkit/Cotizaciones). Lógica completa: catálogo, descuento
   global %/CLP, toggle IVA, numeración BK (última real emitida: **BK1242**),
   datos cliente con RUT/región, condiciones default (Scotiabank CC 992264780,
   50/50, garantía 12m, DTF incluido), salida a PDF. Precios vigentes REALES
   (de PDFs recientes): funda **$14.990**, desbloqueo manual **$38.000**,
   capacitación y software "Incluido". (Los defaults del HTML están viejos:
   $6.500.) La variante con formato más pulido: artifact "Astoreca".
3. **Facturación electrónica (DTE/SII)**: NO certificarse directo (semanas de
   trabajo sin diferenciación). Top-2 proveedores API: **Facto** (plan $0,
   API "desde $0" según volumen — pedir cotización escrita; maneja también
   cotizaciones) y **OpenFactura/Haulmer** ($360.000/año + IVA plano, la
   mejor API/docs). Decisión recién en Fase 3; al inicio basta folio manual
   (SII gratuito web) registrado en el sistema.
4. **Deuda de schema a corregir ANTES de construir encima** (auditoría):
   `tenants` mezcla cuenta-CRM con cliente operativo; `pouches.tenant_id NOT
   NULL` bloquea inventario global; faltan FKs en tickets/comments/attachments;
   `quotes` no congela snapshot del cliente (inaceptable para documentos
   comerciales); convención CLP enteros sin fijar; RLS del CRM todo-o-nada
   (INTERNAL_SALES sin acceso).

---

## Fase 0 — Detener el sangrado + cimientos (1 sesión)

**Objetivo: no perder ni un lead más y dejar el terreno firme.**

- [ ] **Captura de leads real**: Pages Function `/api/contact` → inserta en
      `deals` (stage `lead`, `prospect_name`, `source='web'`) + notificación
      por correo (patrón Resend de invite-user) + honeypot ya existente.
- [ ] Bandeja "Leads entrantes" en AdminCrm (nuevos arriba, botón descartar).
- [ ] Correcciones de schema: FKs faltantes; `tenants.is_customer` (separar
      prospecto de cliente operativo — selector de Fundas y trigger de
      usuarios solo miran clientes reales); `pouches.tenant_id` nullable
      (fundas en bodega central); checks de CLP entero; campo
      `deals.source` y `deals.expected_close_date`.

## Fase 1 — Ventas PRO (1-2 sesiones)

**Objetivo: del lead a la cotización enviada, sin salir del portal.**

- [ ] **Cotizador definitivo** (fusión del original + el del portal):
      - Tabla `products` (catálogo editable, precios vigentes: funda $14.990,
        desbloqueo manual $38.000, desbloqueo smart, capacitación, software
        "Incluido") + chips de inserción rápida + ítem libre.
      - Descuento global (% o CLP), toggle IVA, ítems con precio 0 = "Incluido".
      - Numeración **BK continua desde 1243** (respeta la historia comercial).
      - Snapshot del cliente en la cotización (institución, RUT, contacto,
        región) — inmutable aunque cambie la cuenta.
      - Condiciones default editables (banco, 50/50, validez, entrega, garantía).
      - **PDF de marca** (formato Astoreca) + **envío por correo** desde el
        portal (Resend, registra en email_log) → estado "enviada" automático.
- [ ] **CRM con memoria**: tabla `contacts` (N contactos por cuenta, con
      cargo); `deal_activities` (llamada/reunión/correo/nota + próximo paso
      con fecha → vista "deals fríos"); `deal_stage_history` (conversión y
      velocidad por etapa); owner visible; acceso para INTERNAL_SALES.
- [ ] **Cadena de cierre**: cotización aceptada → deal ganado → crea `order`
      (la bisagra hacia operaciones y finanzas).

## Fase 2 — Operaciones BloKKit (1-2 sesiones)

**Objetivo: saber dónde está cada funda y qué colegio está en qué etapa.**

- [ ] **Inventario global**: stock central BloKKit (fabricadas / en bodega /
      asignadas a colegio / perdidas), movimientos de stock; modelar también
      bases de desbloqueo (manual/smart), no solo fundas.
- [ ] **Despachos** ligados a la orden (cantidades, fecha, recibido por) —
      la entrega alimenta el inventario del colegio automáticamente.
- [ ] **Implementaciones**: proyecto por colegio (piloto → capacitación →
      go-live), hitos y responsable — lo que el sitio ya promete en contacto.
- [ ] Reposición facturable: funda `lost` → evento cobrable opcional.

## Fase 3 — Finanzas (1-2 sesiones)

**Objetivo: la cadena cotización → orden → factura → pago, con cuentas claras.**

- [ ] `orders` (snapshot de ítems, estado confirmada/despachada/completada).
- [ ] `invoices` (folio manual al inicio; neto/IVA/total PERSISTIDOS,
      vencimiento, estado) + `payments` (parciales, medio, referencia).
- [ ] **Cuentas por cobrar**: vista aging (al día / por vencer / vencidas) —
      la pantalla más valiosa para caja.
- [ ] `expenses` simple → flujo de caja mensual.
- [ ] Decisión DTE: cotización escrita a Facto vs OpenFactura; integrar API
      solo cuando el volumen lo pague (>10-15 facturas/mes).
- [ ] Modelar ingreso recurrente vs venta única (si aparece arriendo anual).

## Fase 4 — Marketing + inteligencia (1 sesión)

- [ ] Atribución: `source`/UTM en leads (web, WhatsApp, feria, referido).
- [ ] **Dashboard ejecutivo** (home del admin): pipeline vivo, ventas del
      mes, cuentas por cobrar, stock disponible, colegios activos y su
      operación (asignaciones diarias), leads sin atender.
- [ ] Encuestas v2 (si se decide retomarlas) y secuencias de correo a leads.

---

## Reglas del plan

1. **El espinazo es la cadena de ingreso**: lead → deal → cotización → orden
   → despacho → factura → pago. Cada fase suelda un eslabón; nada se
   construye colgando de un eslabón que no existe.
2. **Cimientos antes que torres**: las correcciones de schema de Fase 0 son
   baratas hoy y carísimas con datos productivos encima.
3. **Comprar lo regulado, construir lo diferencial**: el DTE se delega en un
   proveedor certificado; el CRM/cotizador/operación es nuestro.
4. Cada fase termina deployada y usable — no hay "big bang".
