import * as React from 'react'

import { Button, Hr, Link, Section, Text } from '@react-email/components'

import {
  BrandEmail,
  button,
  buttonWrap,
  footer,
  hr,
  link,
  small,
  text,
} from './brand-layout'

interface EmailChangeEmailProps {
  siteName: string
  // oldEmail is the user's current address (HookData.OldEmail). For the
  // NEW-recipient half of a secure email_change fanout, `email` equals the
  // recipient (NEW), so the "from" line must render oldEmail to read
  // "from OLD to NEW" instead of "from NEW to NEW".
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  oldEmail,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <BrandEmail
    preview="Confirmez le changement d'adresse email de votre compte TalKing®"
    title="Confirmez votre nouvelle adresse email"
  >
    <Text style={text}>
      Vous avez demandé à changer l'adresse email de votre compte{' '}
      <strong>TalKing®</strong> de{' '}
      <Link href={`mailto:${oldEmail}`} style={link}>
        {oldEmail}
      </Link>{' '}
      vers{' '}
      <Link href={`mailto:${newEmail}`} style={link}>
        {newEmail}
      </Link>
      .
    </Text>
    <Section style={buttonWrap}>
      <Button style={button} href={confirmationUrl}>
        Confirmer le changement
      </Button>
    </Section>
    <Hr style={hr} />
    <Text style={small}>
      Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :
      <br />
      <Link href={confirmationUrl} style={link}>
        {confirmationUrl}
      </Link>
    </Text>
    <Text style={footer}>
      Si vous n'êtes pas à l'origine de cette demande, ignorez cet email : votre adresse
      actuelle restera inchangée.
    </Text>
  </BrandEmail>
)

export default EmailChangeEmail
