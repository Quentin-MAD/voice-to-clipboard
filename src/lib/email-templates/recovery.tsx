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

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({ confirmationUrl }: RecoveryEmailProps) => (
  <BrandEmail
    preview="Réinitialisez votre mot de passe TalKing®"
    title="Réinitialisation du mot de passe"
  >
    <Text style={text}>
      Nous avons reçu une demande de réinitialisation du mot de passe de votre compte{' '}
      <strong>TalKing®</strong>. Cliquez sur le bouton ci-dessous pour choisir un
      nouveau mot de passe.
    </Text>
    <Section style={buttonWrap}>
      <Button style={button} href={confirmationUrl}>
        Choisir un nouveau mot de passe
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
      Si vous n'êtes pas à l'origine de cette demande, ignorez cet email : votre mot de
      passe restera inchangé.
    </Text>
  </BrandEmail>
)

export default RecoveryEmail
