import axios from 'axios';

const k2ApiUrl = 'https://api.k2think.ai/v1/chat/completions';
const k2ApiKey = 'IFM-9agAr6OP8CTMtKXU';

const prompt = `You are a pharmacist expert in drug interactions. Assess the interaction between these two products:

Product 1: Aspirin
Type: drug
Generic: acetylsalicylic acid
Active Ingredients: acetylsalicylic acid

Product 2: Ibuprofen
Type: drug
Generic: ibuprofen
Active Ingredients: ibuprofen

Respond in JSON format ONLY:
{
  "has_interaction": boolean,
  "severity": "none" | "mild" | "moderate" | "severe" | "contraindicated",
  "description": "brief interaction description",
  "notes": "brief notes or recommendations"
}

Be conservative. If uncertain, rate as mild.`;

try {
  const response = await axios.post(
    k2ApiUrl,
    {
      model: 'MBZUAI-IFM/K2-Think-v2',
      messages: [
        {
          role: 'system',
          content: 'You are a pharmacist expert. Always respond in valid JSON format only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
    },
    {
      headers: {
        Authorization: `Bearer ${k2ApiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  );

  const content = response.data.choices?.[0]?.message?.content;
  console.log('=== RAW CONTENT ===');
  console.log(content);
  console.log('=== END RAW ===');
} catch (err) {
  console.error('Error:', err.message);
  if (err.response) {
    console.error('Response status:', err.response.status);
    console.error('Response data:', err.response.data);
  }
}
