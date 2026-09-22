/**
 * Placeholder wording, carried over from the design.
 *
 * This is not legal text and must be replaced before anyone signs in
 * production. Replacing it means adding a version 2 entry and deactivating
 * this one, never editing the words below: signatures record the version and a
 * hash of this exact body, and an edit would invalidate every one of them.
 */
export const INDEMNITY_TEMPLATE_V1 = {
  version: 'v1',
  title: 'Fleet Pro Indemnity Agreement',
  body: [
    'TEMPORARY SAMPLE — NOT LEGAL ADVICE',
    '',
    'This Indemnity Agreement (the "Agreement") is entered into between Fleet Pro, operating in partnership with MTN Nigeria (the "Service Provider"), and the customer identified in the account creation application (the "Customer"). By signing this Agreement, the Customer agrees to assume responsibility for certain risks, losses, damages, costs, and claims that may arise from the supply, installation, activation, and use of Fleet Pro devices, connectivity, and platform services.',
    '',
    '1. Definitions',
    '',
    '"Services" means the Fleet Pro telematics platform, licences, hardware devices, IoT SIM connectivity, installation and support supplied by the Service Provider.',
    '',
    '2. Indemnity',
    '',
    'The Customer indemnifies the Service Provider against claims arising from the Customer\'s use of the Services, including misuse of a device, unauthorised modification of installed hardware, and any loss arising from data the Customer supplies.',
    '',
    '3. Limitations',
    '',
    'Nothing in this Agreement limits liability that cannot be limited under the laws of the Federal Republic of Nigeria.',
  ].join('\n'),
} as const;
