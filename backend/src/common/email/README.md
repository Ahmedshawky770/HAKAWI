# Common Email

The single email transport, and the single sender for mail that carries a secret.

## Why this directory exists

`common/` is the inward dependency every module already resolves through — `CommonModule` is
`@Global()`, so its exports are available without an import. Mail used to live entirely inside
`modules/notifications/email/`, which made it unreachable from the modules that needed it:

- `AuthService.forgotPassword` minted a reset token, stored it in Valkey, emitted a tokenless
  `password.reset.requested` and returned. Nobody could receive the code, so password reset was
  unreachable end-to-end.
- `EmailVerificationService.resend` answered `'Verification email sent'` while emitting the same
  tokenless event. No listener for it existed anywhere.

`dependency-rules.md` allows Auth to depend on Core, Users and Config only — not on Notifications.
So the transport could not simply be imported; it had to move inward. `SmtpEmailTransporter` moved
here verbatim, `NotificationsModule` stopped registering it, and there is now exactly one transport
and one SMTP configuration in the codebase.

```
grep -rn "nodemailer.createTransport" backend/src   # exactly one hit: ./smtp-email-transporter.ts
```

## What lives here

| File                             | Role                                                                               |
| -------------------------------- | ---------------------------------------------------------------------------------- |
| `email-transporter.interface.ts` | `EmailTransporter`, the `EMAIL_TRANSPORTER` token, and `resolveEmailFromAddress()` |
| `smtp-email-transporter.ts`      | The only SMTP implementation. Stays `null` without `EMAIL_*` credentials           |
| `transactional-email.service.ts` | The one sender for verification and reset mail. Never throws                       |

`CommonModule` provides `SmtpEmailTransporter`, binds it to `EMAIL_TRANSPORTER`, and exports both it
and `TransactionalEmailService`. `NotificationsEmailService` consumes the same instance, so a
deployment has one pool of five SMTP connections shared by notifications and by the auth flows.

## The token never leaves the request path

Mail that carries a verification or reset code is sent **inside the method that mints the code**, with
the code in the body. It is never put on an event payload and it is never logged:

- Events are logged by `EventValidatorService`, parked in the DLQ, and replayed. A token on an event
  payload is a token in three logs and a queue (Principle #15).
- Winston output is aggregated and retained, so the body of these mails is never passed to a log
  line. `TransactionalEmailService` logs the recipient and the subject — both already present in the
  request — and the transport's own failure message.

`email.verification.requested` and `password.reset.requested` still fire, and still carry no token.
They are audit signals for "a code was minted for this account", not delivery instructions.

## Failure behaviour

`TransactionalEmailService` returns an outcome instead of throwing. Sending is a side effect
(Principle #14), so an SMTP outage must not turn a registration, a resend or a password-reset request
into a 500. What each endpoint says about the outcome is documented in that module's README — the one
thing none of them may do is claim a mail was sent when it was not.

## What a deployment must provide

Four variables, all or nothing: `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASSWORD`. Without any
one of them the transporter stays `null`, `isConfigured()` answers `false`, and every verification and
password-reset mail is reported as undelivered — which is truthful, but is also a silently disabled
feature if nobody knew the deploy was missing its configuration.

`EMAIL_PROVIDER` is the one non-secret knob (`smtp` by default, meaning "use the host and port
verbatim"; `gmail`, `sendgrid`, `mailgun` and `ses` each rewrite the connection shape) and
`EMAIL_FROM` is the sender address. The chart carries `EMAIL_PROVIDER` in its ConfigMap, mounts
`EMAIL_FROM` from the platform secret store, and — since the deployment-side review — syncs the four
credentials through the ExternalSecret, so a chart upgrade no longer depends on somebody remembering
that the backend reads them. The Terraform `secrets` module owns the corresponding Secrets Manager
entries under `<environment prefix>/email/*`; an empty value means "this environment sends no mail",
which is a legitimate dev posture and a production smell.
