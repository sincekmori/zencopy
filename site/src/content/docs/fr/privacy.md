---
title: Confidentialité
description: Ce qui quitte votre appareil, ce qui y reste, et qui d'autre intervient.
sidebar:
  hidden: true
---

ZenCopy est une application de bureau locale.
Elle n'a ni serveur, ni compte, ni télémétrie.

## Ce qui quitte votre appareil

Quand vous appuyez sur le déclencheur (<span data-os-modifier>Ctrl/⌘</span> + C + C), le contenu du presse-papiers capturé est envoyé directement au fournisseur de LLM que _vous_ avez configuré — rien d'autre, et nulle part ailleurs.
Ce qui est envoyé exactement dépend de l'action qui s'exécute :

- Le prompt rendu, qui peut incorporer le contexte de la capture sous forme de [variables de gabarit](/fr/configuration/#actionsmd) : le texte copié et son balisage, le nom de l'application source et le titre de sa fenêtre, l'URL de la page, la date et votre langue.
- Pour une image ou des fichiers copiés, le contenu lui-même est joint (jusqu'à 10 Mo par capture) — et pour les fichiers, leurs chemins complets.
  Par défaut, le popup demande confirmation avant de les envoyer.

Un simple copier ordinaire n'est jamais capturé ni envoyé.
Le contenu du presse-papiers que d'autres applications marquent comme sensible (les gestionnaires de mots de passe, par exemple) est ignoré.

## Ce qui reste sur votre appareil

- Vos clés d'API (`ai-sdk-catalog.json` dans le répertoire de configuration de l'application — jamais embarquées, jamais téléversées).
- Vos réglages (thème, langue, position du popup, …).
- Les fichiers journaux.
  Les journaux masquent les secrets et ne contiennent jamais le contenu copié ni les clés d'API.

## Tiers

Votre utilisation d'un fournisseur de LLM est régie par les conditions et la politique de confidentialité de ce fournisseur.
ZenCopy n'ajoute aucun intermédiaire : votre contenu ne va qu'au fournisseur que vous configurez, et son utilisation comme ses coûts vous appartiennent.

## Ne nous croyez pas sur parole

ZenCopy est open source (Apache-2.0).
Chaque affirmation de cette page peut être vérifiée dans [le code source](https://github.com/sincekmori/zencopy).
