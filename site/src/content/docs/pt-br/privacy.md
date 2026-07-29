---
title: Privacidade
description: O que sai do seu dispositivo, o que fica e quem mais está envolvido.
sidebar:
  hidden: true
---

O ZenCopy é um aplicativo de desktop local.
Ele não tem servidor, nem conta, nem telemetria.

## O que sai do seu dispositivo

Quando você pressiona o gatilho (<span data-os-modifier>Ctrl/⌘</span> + C + C), o conteúdo capturado da área de transferência é enviado diretamente ao provedor de LLM que _você_ configurou — nada além disso, e para nenhum outro lugar.
O que exatamente é enviado depende da ação executada:

- O prompt renderizado, que pode incorporar o contexto da captura como [variáveis de template](/pt-br/configuration/#actionsmd): o texto e o markup copiados, o nome do aplicativo de origem e o título da janela, a URL da página, a data e o seu idioma.
- Para uma imagem ou arquivos copiados, o próprio conteúdo é anexado (até 10 MB por captura) — e, no caso de arquivos, seus caminhos completos.
  Por padrão, o popup pergunta antes de enviá-los.

Um único copiar normal nunca é capturado nem enviado.
Conteúdo da área de transferência que outros aplicativos marcam como sensível (ex.: gerenciadores de senhas) é ignorado.

## O que fica no seu dispositivo

- Suas chaves de API (`ai-sdk-catalog.json` no diretório de configuração do aplicativo — nunca empacotadas, nunca enviadas).
- Suas configurações (tema, idioma, posição do popup, …).
- Arquivos de log.
  Os logs ocultam segredos e nunca incluem conteúdo copiado nem chaves de API.

## Terceiros

Seu uso de um provedor de LLM é regido pelos termos e pela política de privacidade do próprio provedor.
O ZenCopy não adiciona nenhum intermediário: seu conteúdo vai apenas para o provedor que você configura, e o uso e os custos são seus.

## Não acredite só na nossa palavra

O ZenCopy é de código aberto (Apache-2.0).
Toda afirmação desta página pode ser verificada no [código-fonte](https://github.com/sincekmori/zencopy).
