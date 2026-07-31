import * as React from 'react'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

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
  <Html lang="fr" dir="ltr">
    <Head />
    <Preview>Confirmez votre adresse email pour activer votre compte TalKing®</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Text style={brand}>TalKing®</Text>
        </Section>
        <Section style={card}>
          <Heading style={h1}>Confirmez votre adresse email</Heading>
          <Text style={text}>
            Merci de votre inscription sur{' '}
            <Link href={siteUrl} style={link}>
              <strong>TalKing®</strong>
            </Link>{' '}
            - la traduction vocale en temps réel pour vos jeux et vos échanges.
          </Text>
          <Text style={text}>
            Votre compte est créé avec l'adresse <strong>{recipient}</strong>, mais il
            n'est pas encore actif. Cliquez sur le bouton ci-dessous pour le valider :
          </Text>
          <Section style={{ textAlign: 'center' as const, margin: '32px 0' }}>
            <Button style={button} href={confirmationUrl}>
              Vérifier mon adresse email
            </Button>
          </Section>
          <Text style={warn}>
            ⚠️ Sans validation, votre compte est automatiquement supprimé au bout de
            2 heures et vous devrez recommencer l'inscription.
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
            Si vous n'êtes pas à l'origine de cette inscription, ignorez simplement cet
            email.
          </Text>
        </Section>
        <Text style={legal}>TalKing® - talking-translator.com</Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail

const NAVY = '#0A0A29'
const BLUE = '#3F44D2'
const GREY = '#DBDBDF'

const main = {
  backgroundColor: '#ffffff',
  fontFamily: 'Roboto, Arial, sans-serif',
  margin: 0,
  padding: '24px 0',
}
const container = { maxWidth: '560px', margin: '0 auto', padding: '0 16px' }
const header = {
  backgroundColor: BLUE,
  borderRadius: '12px 12px 0 0',
  padding: '20px 24px',
  textAlign: 'center' as const,
}
const brand = {
  color: '#ffffff',
  fontSize: '24px',
  fontWeight: 'bold' as const,
  margin: 0,
  letterSpacing: '0.5px',
}
const card = {
  border: `1px solid ${GREY}`,
  borderTop: 'none',
  borderRadius: '0 0 12px 12px',
  padding: '28px 24px',
}
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: NAVY,
  margin: '0 0 20px',
}
const text = { fontSize: '15px', color: NAVY, lineHeight: '1.6', margin: '0 0 16px' }
const link = { color: BLUE, textDecoration: 'underline' }
const button = {
  backgroundColor: BLUE,
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 'bold' as const,
  borderRadius: '8px',
  padding: '14px 28px',
  textDecoration: 'none',
}
const warn = {
  fontSize: '14px',
  color: NAVY,
  backgroundColor: GREY,
  borderRadius: '8px',
  padding: '12px 14px',
  lineHeight: '1.5',
  margin: '0 0 8px',
}
const hr = { borderColor: GREY, margin: '24px 0' }
const small = { fontSize: '12px', color: '#55575d', lineHeight: '1.5', wordBreak: 'break-all' as const }
const footer = { fontSize: '12px', color: '#999999', margin: '20px 0 0' }
const legal = { fontSize: '11px', color: '#999999', textAlign: 'center' as const, margin: '16px 0 0' }
