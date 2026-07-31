import * as React from 'react'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  fromEmail?: string
  userId?: string
  subjectLine?: string
  message?: string
}

const SupportMessage = ({ fromEmail, userId, subjectLine, message }: Props) => (
  <Html lang="fr" dir="ltr">
    <Head />
    <Preview>{`Nouveau message support - ${subjectLine ?? 'sans objet'}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={heading}>Nouveau message support</Heading>
        <Section>
          <Text style={meta}>
            <strong>De :</strong> {fromEmail ?? 'inconnu'}
          </Text>
          <Text style={meta}>
            <strong>User ID :</strong> {userId ?? 'inconnu'}
          </Text>
          <Text style={meta}>
            <strong>Objet :</strong> {subjectLine ?? 'sans objet'}
          </Text>
        </Section>
        <Hr style={hr} />
        <Text style={body}>{message ?? ''}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: SupportMessage,
  subject: (data: Record<string, any>) =>
    `[Support] ${data.subjectLine ?? 'Nouveau message'}`,
  displayName: 'Message support',
  previewData: {
    fromEmail: 'membre@example.com',
    userId: '00000000-0000-0000-0000-000000000000',
    subjectLine: "Problème avec l'application Windows",
    message: "Bonjour,\n\nLe raccourci F8 ne répond plus depuis la mise à jour.\n\nMerci !",
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily: 'Roboto, Arial, sans-serif',
  color: '#0A0A29',
}
const container = { padding: '24px 28px', maxWidth: '560px' }
const heading = {
  fontFamily: 'Poppins, Arial, sans-serif',
  fontWeight: 700,
  fontSize: '22px',
  margin: '0 0 16px',
  color: '#0A0A29',
}
const meta = { fontSize: '14px', margin: '0 0 6px' }
const hr = { borderColor: '#DBDBDF', margin: '20px 0' }
const body = {
  fontSize: '15px',
  lineHeight: '24px',
  whiteSpace: 'pre-wrap' as const,
  backgroundColor: '#F4F4F8',
  padding: '14px 16px',
  borderRadius: '8px',
}
