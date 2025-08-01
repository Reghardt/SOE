export async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function printConsecutiveDifferences(numbers: number[]) {
  if (numbers.length < 2) {
    console.log(
      "Array must contain at least two numbers to calculate differences.",
    );
    return;
  }

  let sumDifferences = 0;

  console.log("Differences between consecutive numbers:");
  for (let i = 1; i < numbers.length; i++) {
    const diff = numbers[i] - numbers[i - 1];
    console.log(
      `Difference between ${numbers[i]} and ${numbers[i - 1]} is: ${diff}`,
    );
    sumDifferences += diff;
  }

  return sumDifferences;
}
