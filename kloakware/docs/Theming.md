# Theming

How the login, the mails and the account console come to look and speak like Steward without a
copy of Keycloak's templates to maintain, how a market chooses the language a user is addressed
in, and what an upgrade does to all of it. K14 adds the `steward` theme as a Maven module compiled
into the image like the extensions, extending Keycloak's own themes: a stylesheet and a wordmark,
the messages in English, Swedish and German, the BankID step's words, the mails' subjects, the
console's title; the realm speaks three languages and the `steward` client wears the theme while
every other client keeps Keycloak's. The plan is [docs/Kloakware.md](../../docs/Kloakware.md); the
theme is [extensions/theme-steward/](../extensions/theme-steward/); the mail sink on a laptop is
[deploy/compose/mail/](../deploy/compose/mail/); the test is `ThemeTest`.

## What a theme is, and what this one touches

A Keycloak theme is a directory per type, `login`, `email`, `account`, `admin`, each with a
`theme.properties` that names a parent, the stylesheets and scripts to serve, the locales to
offer, and the CSS class names the templates read as `${properties.kc...}`; beside it, FreeMarker
templates that override the parent's, `messages/messages_<locale>.properties` that override the
parent's strings, and `resources/` served as static files. Resolution walks the parents: a
template, a message or a resource is taken from the first theme in the chain that has it. A theme
ships as a directory under `themes/` or, as here, as a JAR in `providers/` with
`META-INF/keycloak-themes.json` naming the themes and types it carries, which is how it reaches
every environment inside the image.

The whole point of this theme is how little of that it uses:

| Type      | Parent        | What the theme adds                                                                                                                                         | What it does not touch                                                                      |
| --------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `login`   | `keycloak.v2` | `css/steward.css` with the brand through PatternFly's tokens and the wordmark where the realm's name went; messages in `en`, `sv`, `de`; `locales=en,sv,de` | every template; the parent's class names; the parent's own Swedish and German               |
| `email`   | `keycloak`    | the subjects of the reset, the verification and the update-your-account mails in the three languages                                                        | the templates, the link, the expiry, the sanitising                                         |
| `account` | `keycloak.v3` | `css/steward.css` with the brand tokens; the title                                                                                                          | the console, which is a single-page application whose templates are not a surface to extend |

The login theme's `keycloak.v2` is Keycloak's own since 24, PatternFly 5, with a template per
step and class names in `theme.properties`; the theme extends it and overrides nothing of it, so
a release that reworks `login.ftl` or renames a class reworks it here too, with no fork to carry
forward. The stylesheet reaches in through the CSS custom properties PatternFly exposes
(`--pf-v5-global--primary-color--100` and its neighbours) and one id the template has kept across
releases, `#kc-header-wrapper`, where the realm's name is rendered and the wordmark now sits. That
is the whole surface, chosen because it is the one that survives a minor.

## Three languages, chosen by the market

The realm turns internationalisation on with `en`, `sv` and `de` and English as the default, and
the theme's `locales=` restricts the switcher to those three, where the parent offers forty.
Keycloak then picks a user's language in this order: the user's `locale` attribute once the user
is known, the `KEYCLOAK_LOCALE` cookie the page's own switcher sets (its links carry `kc_locale`
back to a login action, which is where the parameter counts; on the authorisation endpoint
itself it does not), the browser's `Accept-Language`, the realm's default. The
market decides the attribute: the dev overlay seeds `sv` for the Swedish operator and `de` for the
German one, the migration command (K13) sets it from the market as it imports, and a federation
mapper does the same for a directory's users. So the login page opens in the browser's language or
the realm's default, and the moment the user is known, before the second factor, it switches to the
language their market speaks; the mails follow the attribute too.

`ThemeTest` reads the login page in English, then as a Swedish and a German browser would, by
`Accept-Language`, and finds the theme's title in each and the parent's own Swedish for the field labels, which the theme never
had to translate; then it signs the Swedish operator in without asking for a language and finds
the BankID step in Swedish.

## The BankID step: the extension carries logic, the theme carries words

The market second factor (K5) renders a template of its own, `steward-bankid.ftl`, shipped inside
the extension as theme resources with its English messages, so the authenticator works under any
theme. The theme carries the same messages in Swedish and German, and the test proves the chain:
the step's title and button in Swedish from the theme, and the pending message, which the
extension raises by key, resolved in Swedish through the theme too. The extension decides what to
say; the theme decides how to say it. The template itself stays with the extension, because a
template without its authenticator is nothing and an authenticator without its template fails.

## The mails, and reading them on a laptop

The realm names its mail server from the environment, `KLOAKWARE_SMTP_HOST`, `_PORT` and `_FROM`,
with the laptop's sink as the default: `deploy/compose/mail/Sink.py`, an SMTP server in the
Python standard library that keeps every message and lists them as JSON on `:8025`, in the compose
stack and the test stack both. The theme sets the subjects in the three languages and leaves
Keycloak's templates to say the rest, the link and its expiry included. The test asks the admin API
to send the Swedish operator an update-your-account mail and reads it back from the sink:
Steward's subject in Swedish, his address, the action-token link.

## The theme on the client, not the realm

The login theme is set on the `steward` client, `login_theme=steward`, not on the realm. A realm
has one login theme for every client, the admin and account consoles' own sign-in included; a
client has its own, and a realm that serves several applications, Steward and the legacy
dashboard of K13 among them, dresses each as its owner asks. The test opens the legacy dashboard's
login page and finds Keycloak's own. The email and account themes are the realm's, since a mail
and the console belong to the user rather than to a client.

## What an upgrade does to a theme

A minor release changes templates: 24 replaced the login theme wholesale with `keycloak.v2`, 25
and 26 moved the account console to `keycloak.v3` and reshaped `login.ftl` more than once. A
theme that copied a template carries the copy forward by hand, reads the release's diff, and finds
out in production that a form field moved. A theme that only extends carries nothing: its
stylesheet keeps working as long as the tokens and the one id do, and its messages keep
resolving as long as the keys do, and both of those are what Keycloak keeps stable across minors,
templates being what it does not. The repository's gate is the same as for the extensions (K9,
K18): the image is built on the next release in the upgrade rehearsal, and `ThemeTest` fails there
if the stylesheet or a message stops arriving. The lesson for the team is a rule: override a
template only when there is no other way, keep the override as small as the step, and expect to
revisit it on every minor.

## Keycloakify, and when it is worth it

Keycloakify builds a login theme from React, with the step's data as typed props and the result
packaged as the same kind of JAR; it is the right tool when the login must share components with
the product's own front end, when designers work in the product's design system rather than in
PatternFly, or when a step needs behaviour a FreeMarker template cannot give. It is a build of its
own, a dependency on Keycloakify's tracking of each Keycloak release, and a theme that no longer
follows the parent's changes for free, which is what K14 gets for a stylesheet and three message
files. For an access service whose login is a form and a second factor, dressed in a colour and a
wordmark and speaking three languages, the extending theme is the whole job; the React theme
waits for the day the login becomes a product surface.

## Interview questions

### Q28. "How do you brand and localise the login for several markets without forking Keycloak's templates, and what does an upgrade do to a theme?"

Extend, never copy: a theme whose parent is Keycloak's own login theme, with a stylesheet, a
logo and message files, and nothing of the templates; then let the market choose the language
through the user's locale attribute.

A Keycloak theme resolves through its parents, so a theme that names `keycloak.v2` as its parent
and ships only `css/steward.css`, a wordmark and `messages_<locale>.properties` gets every
template, every class name and every one of the parent's forty translations for free, and overrides
exactly the strings that carry the brand: the title, and the words of the custom steps. Branding
reaches in through PatternFly's CSS custom properties and the one header id the template has kept
across releases, which is the surface that survives upgrades. Localising for markets is three
things: the realm's supported locales with the theme's `locales=` narrowing the switcher, the
custom extensions' messages translated in the theme so an authenticator's words follow the
language, and the user's `locale` attribute set from the market at import or sync, which
Keycloak applies the moment the user is known, so the second factor and the mails are in the
market's language whatever the browser said. An upgrade changes templates, not tokens and keys:
a theme that only extends needs no work on a minor and the container test on the next release
says so, while a theme that copied a template is a fork to carry and the reason to override as
little as the step allows.

_Evidence in this repository:_ `extensions/theme-steward/` with its three `theme.properties`;
`internationalizationEnabled` and the locales in `config/realms/steward.json`; the `locale` seeded
in the dev overlay and set by the migration; `ThemeTest`.

### Q29. "FreeMarker themes or Keycloakify, and a theme per client or per realm: when do you pick which?"

FreeMarker by extension for a login that is a form and a second factor; Keycloakify when the login
is a product surface that must share the product's components; the theme on the client when a
realm serves more than one application, on the realm for mails and the console.

The extending FreeMarker theme costs a stylesheet and message files, follows the parent's
templates through every release for free, and needs no build beyond a JAR of resources; its limit
is behaviour, since a template renders what the step hands it and no more. Keycloakify gives the
login React, typed props per step, the product's design system and whatever behaviour a component
can carry, at the price of a build, a dependency that tracks each Keycloak release, and a theme
that no longer inherits the parent's changes. The choice is about who owns the login: an access
service dresses it, a product designs it. Per client or per realm is about who the page belongs
to: a realm's login theme covers every client, the consoles' sign-in included, so a realm that
serves several applications sets the theme on each client and leaves the realm on Keycloak's own,
which keeps the administrators' pages recognisably Keycloak's; mails and the account console are
the user's rather than a client's, so their themes are the realm's. Kloakware does exactly that:
the `steward` client wears the theme, the legacy dashboard does not, and the realm's email and
account themes are Steward's.

_Evidence in this repository:_ `login_theme` on the `steward` client and `emailTheme` and
`accountTheme` on the realm in `config/realms/steward.json`; the legacy dashboard's page in
`ThemeTest`; the Keycloakify paragraph in this guide.
