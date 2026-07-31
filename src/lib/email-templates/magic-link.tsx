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

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({ confirmationUrl }: MagicLinkEmailProps) => (
  <BrandEmail
    preview="Votre lien de connexion TalKing®"
    title="Votre lien de connexion"
  >
    <Text style={text}>
      Cliquez sur le bouton ci-dessous pour vous connecter à votre compte{' '}
      <strong>TalKing®</strong>. Ce lien expire rapidement, pour votre sécurité.
    </Text>
    <Section style={buttonWrap}>
      <Button style={button} href={confirmationUrl}>
        Me connecter
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
      Si vous n'avez pas demandé ce lien, ignorez simplement cet email.
    </Text>
  </BrandEmail>
)

export default MagicLinkEmail
