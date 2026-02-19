# UI Components

General-purpose components used across pages.

## Nav

Top navigation bar. Renders router links to home and about pages. Appears on every page via the root layout in `app.tsx`.

## Hero

Centered hero section. Accepts a title, description, and optional children. Used on the about and 404 pages.

## Card

Generic card wrapper using DaisyUI's card component. Accepts a title, optional actions slot, and children.

## Table

Data table component with DaisyUI styling. Supports:

- Zebra-striped rows
- Pinned rows/columns
- Generic column/row data via props

## Counter

Simple counter demonstrating `createSignal`. Not part of the main app — exists as a SolidJS example.
