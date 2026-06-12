# EcommerceAgent — Elite Commerce Network

Plataforma de dropshipping para agentes colombianos que venden en Estados Unidos.

## Estructura del Proyecto

```
ecommerceAgent/
│
├── index.html                  ← Archivo principal (abrir en navegador)
│
├── assets/
│   ├── css/
│   │   └── styles.css          ← Todos los estilos
│   │
│   ├── js/
│   │   └── app.js              ← Toda la lógica de navegación
│   │
│   └── images/                 ← Aquí van imágenes/logos (vacío por ahora)
│
└── README.md                   ← Este archivo
```

## Cómo usar

1. Abre `index.html` directamente en el navegador
2. Para editar estilos → `assets/css/styles.css`
3. Para editar lógica → `assets/js/app.js`
4. Para editar estructura/contenido → `index.html`

## Flujo de la plataforma

```
Landing → Token Entry → Registro → Dashboard (Agente)
                    ↓
                  Login → Dashboard (Agente o Admin)
```

## Token de demo
- `DEMO-1234-ABCD-5678`
- `EA-2025-BETA-0001`
- O cualquier string de 8+ caracteres

## Próximos pasos (integraciones pendientes)
- [ ] Conectar Supabase para auth real y tokens
- [ ] Integrar API de AutoDS para productos reales
- [ ] Sistema de comisiones de afiliados
- [ ] Panel de pedidos y tracking
