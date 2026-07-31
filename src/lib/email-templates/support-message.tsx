import * as React from 'react'
import { Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { BrandEmail, Hr, hr, text, warn, NAVY, GREY } from './brand-layout'

interface Props {
  fromEmail?: string
  userId?: string
  subjectLine?: string
  message?: string
}

const SupportMessage = ({ fromEmail, userId, subjectLine, message }: Props) => (
  <BrandEmail
    preview={`Nouveau message support - ${subjectLine ?? 'sans objet'}`}
    title="Nouveau message support"
  >
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
    <Text style={warn}>
      Répondez directement à cet email : la réponse partira vers l'adresse du membre.
    </Text>
  </BrandEmail>
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

const meta = { ...text, fontSize: '14px', margin: '0 0 6px' }
const body = {
  ...text,
  whiteSpace: 'pre-wrap' as const,
  backgroundColor: '#F4F4F8',
  border: `1px solid ${GREY}`,
  color: NAVY,
  padding: '14px 16px',
  borderRadius: '8px',
}
