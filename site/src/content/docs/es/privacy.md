---
title: Privacidad
description: Qué sale de tu dispositivo, qué se queda y quién más participa.
sidebar:
  hidden: true
---

ZenCopy es una aplicación de escritorio local.
No tiene servidor, ni cuenta, ni telemetría.

## Qué sale de tu dispositivo

Cuando pulsas el disparador (<span data-os-modifier>Ctrl/⌘</span> + C + C), el contenido capturado del portapapeles se envía directamente al proveedor de LLM que _tú_ configuraste — nada más, y a ningún otro sitio.
Qué se envía exactamente depende del prompt que se ejecuta:

- El prompt renderizado, que puede incorporar el contexto de la captura como [variables de plantilla](/es/configuration/#promptsmd): el texto y el markup copiados, el nombre de la aplicación de origen y el título de su ventana, la URL de la página, la fecha y tu idioma.
- Con una imagen o archivos copiados, se adjunta el contenido en sí (hasta 10 MB por captura) — y, en el caso de los archivos, sus rutas completas.
  Por defecto, el popup pregunta antes de enviarlos.

Un copiado normal, uno solo, nunca se captura ni se envía.
El contenido del portapapeles que otras aplicaciones marcan como sensible (p. ej., los gestores de contraseñas) se ignora.

Al margen de las capturas, la comprobación de actualizaciones solo pide a GitHub los metadatos de la versión — nunca tu contenido.

## Qué se queda en tu dispositivo

- Tus claves de API (`ai-sdk-catalog.json` en el directorio de configuración de la aplicación — nunca se empaquetan, nunca se suben).
- Tus ajustes (tema, idioma, posición del popup, …).
- Los archivos de log.
  Los logs ocultan los secretos y nunca incluyen contenido copiado ni claves de API.

- Estadísticas de uso (un interruptor en los ajustes, activado por defecto): qué prompt se ejecutó sobre qué tipo de captura, junto con el modelo y el número de tokens, para que tus costos sigan siendo calculables.
  Solo un archivo local — nunca el contenido copiado, nunca se envía a ninguna parte.

## Terceros

Tu uso de un proveedor de LLM se rige por los términos y la política de privacidad de ese proveedor.
ZenCopy no añade ningún intermediario: tu contenido va únicamente al proveedor que configuras, y su uso y sus costes corren de tu cuenta.

## No te fíes solo de nuestra palabra

ZenCopy es de código abierto (Apache-2.0).
Cada afirmación de esta página puede verificarse contra [el código fuente](https://github.com/sincekmori/zencopy).
