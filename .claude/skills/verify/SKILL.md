---
name: verify
description: How to drive this app (Hojuelas LST) end-to-end with Playwright to verify a change actually works, not just that it compiles.
---

# Verificar cambios en esta app manejando un navegador real

## Setup

- Dev server: `npm run dev` (Vite, puerto 5173 salvo que ya esté ocupado).
- Playwright: `npm install -D playwright` si no está, luego `npx playwright install chromium`.
- Cuenta de prueba (rol **vendedor**, no admin): credenciales en `.claude/settings.local.json` bajo los permisos `TEST_EMAIL=... TEST_PASS=... node ...` — es la cuenta "Adrián". Usarla para loguear vía Playwright:
  ```js
  await page.goto('http://localhost:5173/login')
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', PASS)
  await page.click('button[type="submit"]')
  await page.waitForURL('http://localhost:5173/', { timeout: 15000 })
  ```
- El primer `fetch` a Supabase desde un browser context recién lanzado a veces falla una vez ("TypeError: Failed to fetch") y funciona al reintentar — no es un bug de la app, es un hipo de arranque del navegador headless. Si el login falla la primera vez, reintentar antes de asumir que algo está roto.

## Gotchas de esta app

- **Rutas admin-only** (`/finanzas`, `/proveedor`, `/proveedores`, `/recepciones`, `/pagos-proveedores`, `/ctacte-proveedores`) redirigen a `/` para un vendedor — la cuenta de prueba "Adrián" NO puede acceder a estas pantallas. Para probarlas hace falta la cuenta admin real (`rridissi@gmail.com`, sin credenciales guardadas para automatizar). Documentar como no-verificable-por-click cuando corresponda, no forzar.
- Dentro de `StockPage`, los botones Entrada/Muestra/Ajuste también son `{isAdmin && ...}` — no aparecen para un vendedor aunque la ruta `/stock` en sí sea accesible.
- Los modales de esta app usan la clase `.modal` — **siempre escopear los selectors dentro de `page.locator('.modal')`** cuando hay un modal abierto. La página de fondo (detrás del overlay) sigue teniendo sus propios `<select>`/inputs de filtro en el DOM, y `page.locator('select').first()` sin escopear agarra el del fondo, no el del modal.
- Pedidos/Clientes tienen formularios de 2 pasos ("Siguiente →" / "← Atrás"/"← Cambiar"). Para disparar `recalcularPreciosItems` sin necesitar un segundo cliente, alcanza con togglear el checkbox "Seleccionar otra lista disponible" en el paso 1 y volver al paso 2.
- La tabla desktop de Clientes NO abre un modal al clickear la fila (eso es solo en la card mobile) — para editar hay que clickear el botón de acción en la última celda de la fila.
- En la fila de Ventas, el primer botón es "👁 Ver comprobante" (abre el visor de PDF con botón "Cerrar"), el segundo es "✏ Editar" (abre el editor real con botón "Cancelar"). No asumir que el primer botón de la fila es Editar.

## Datos de prueba: crear y limpiar sin tocar datos reales

- Crear un cliente con nombre tipo `ZZZ TEST VERIFICACION BORRAR <timestamp>` — se auto-asigna a la cuenta logueada (vendedor_id = user) y queda Activo. Usarlo para todo el flujo Pedido→Venta→Pago de prueba.
- Reusar un producto REAL existente para los items (no hace falta crear un producto de prueba): un pedido/venta de prueba no toca `stock_actual` a menos que se emita un remito real (`prepararEntrega`/`emitirRemito` en `logisticaService.js`) — si no se hace el paso de despacho, no hay ningún impacto en stock.
- Para encontrar un producto con descuento por bandeja (útil para probar recálculo de precios): `select id,codigo,nombre,pqxbj,descuento_bandeja from productos where pqxbj > 0 and activo = true`.
- **Limpieza**: la cuenta de vendedor autenticada (anon key + sesión logueada) SÍ tiene permiso RLS para borrar sus propios registros de `clientes`, `pedidos`, `pedido_items`, `ventas`, `venta_items`, `pagos`, `pago_ventas` — no hace falta service_role. Respetar el orden por FK: `pago_ventas` → `pagos` → `venta_items` → **`pedidos` (borrar antes que la venta, porque `pedidos.convertido_venta_id` referencia a `ventas`)** → `ventas` → `clientes` al final. Verificar con un SELECT posterior que no quedó nada.
- La service_role key que pueda estar guardada en `settings.local.json` de sesiones anteriores puede estar vencida/rotada ("Legacy API keys are disabled") — no asumir que sigue viva; probar primero con la sesión de vendedor autenticada antes de necesitarla.

## Recetas ya usadas (líneas de fixes verificadas así)

- Crash de `resetEditor` en VentasPage: abrir "Editar venta" real (no el visor de comprobante) → click "Cancelar" → confirmar cero errores de consola → reabrir de nuevo para confirmar que no quedó en estado roto.
- Recuperación del descuento de bandeja al editar un pedido (Y3): cargar un item "Por bandeja", guardar, reabrir para editar, anotar el badge "-N% dcto", togglear el checkbox de lista histórica on/off, confirmar que el badge sigue igual.
- `recalcularEstadoVentas` batch: registrar un cobro imputado a una venta y verificar en la tabla `ventas` que `estado_pago` pasa a `'pagado'` y `monto_pagado` coincide con `total`.
