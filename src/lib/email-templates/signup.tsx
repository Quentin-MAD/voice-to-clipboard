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
  warn,
} from './brand-layout'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <BrandEmail
    preview="Confirmez votre adresse email pour activer votre compte TalKing®"
    title="Confirmez votre adresse email"
  >
    <Text style={text}>
      Merci de votre inscription sur{' '}
      <Link href={siteUrl} style={link}>
        <strong>TalKing®</strong>
      </Link>{' '}
      - la traduction vocale en temps réel pour vos jeux et vos échanges.
    </Text>
    <Text style={text}>
      Votre compte est créé avec l'adresse <strong>{recipient}</strong>, mais il n'est
      pas encore actif. Cliquez sur le bouton ci-dessous pour le valider :
    </Text>
    <Section style={buttonWrap}>
      <Button style={button} href={confirmationUrl}>
        Vérifier mon adresse email
      </Button>
    </Section>
    <Text style={warn}>
      ⚠️ Sans validation, votre compte est automatiquement supprimé au bout de 2 heures
      et vous devrez recommencer l'inscription.
    </Text>
    <Hr style={hr} />
    <Text style={small}>
      Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :
      <br />
      <Link href={confirmationUrl} style={link}>
        {confirmationUrl}
      </Link>
    </Text>
    <Text style={footer}>
      Si vous n'êtes pas à l'origine de cette inscription, ignorez simplement cet email.
    </Text>
  </BrandEmail>
)

export default SignupEmail
