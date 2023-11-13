import { CompletionCreateParams } from "openai/resources/chat/index";

export const functions: CompletionCreateParams.Function[] = [
  {
    name: "do_good",
    description:
      "Do something good.",
    parameters: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description: "The address",
        },
      },
      required: ["address"],
    },
  },
];

async function make_impact(address: string) {

  const requestBody = {
    projectId: `${process.env.PROJECT_ID}`,
    contractAddress: '0xa2327a938febf5fec13bacfb16ae10ecbc4cbdcf',
    chainId: 1,
    functionSignature: 'transferFrom(address from, address to, uint256 value)',
    args: {
      from: '0x80a8b77065d682E9394bB0c80952fA28c314723e',
      to: address,
      value: 1000000,
    }
  };

  // Sent the API request and return the response based on the status code
  try {

    const response = await fetch("https://api.syndicate.io/transact/sendTransaction", {
      method: "POST",
      headers: {
        'Authorization': `Bearer ${process.env.SYNDICATE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
    });

    // Parse the JSON response
    const responseData = await response.json();

    // Check the response status
      if (response.ok) {
        // Transaction was successful
        return { status: 'success', data: responseData };
      } else {
        // Handle errors with the transaction (e.g., 400, 500, etc.)
        console.error('Error sending tx:', responseData);
        return { status: 'error', error: responseData };
      }
  } catch (error) {
      // Handle network or parsing errors
      console.error('Error:', error);
      return { status: 'error', error };
    }

}

// Get transaction hash from transactionId using Syndicate API with retry logic
async function get_hash(transactionId: string): Promise<string> {
  let transactionHash = '';
  const options = {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${process.env.SYNDICATE_API_KEY}`
    }
  };

  // Keep trying until the transaction hash is available
  while (!transactionHash) {
    try {
      const response = await fetch(`https://api.syndicate.io/wallet/project/${process.env.PROJECT_ID}/request/${transactionId}`, options);
      const data = await response.json();
      transactionHash = data.transactionAttempts[0]?.hash || '';
    } catch (error) {
      console.error('Error getting transaction details:', error);
    }
    // Wati for a few seconds before retrying
    if (!transactionHash) {
      await new Promise(resolve => setTimeout(resolve, 5000));  // Wait for 5 seconds
    }
  }

  return transactionHash;
}

async function do_good(address: string) {
  const response = await make_impact(address);
  const transactionHash = await get_hash(response.data.transactionId);
  const transactionUrl = `https://etherscan.io/tx/${transactionHash}`;
  return transactionUrl;
}

export async function runFunction(name: string, args: any) {
  switch (name) {
    case "do_good":
      return await do_good(args["address"]);
    default:
      return null;
  }
}
