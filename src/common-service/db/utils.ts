import { FindOptionsWhere, Repository } from 'typeorm';
import { CContract, Contract, Network, PContract } from '~db/entities';
import { DeployNetworkKey } from '../types';
import { DbQuerable } from './types';

export async function truncateTables(queryRunner: DbQuerable, tables: string[]) {
  for (const table of tables) {
    await queryRunner.query(`TRUNCATE table ${table} CASCADE`);
  }
}

export async function findNetwork(
  network: DeployNetworkKey,
  networkRepository: Repository<Network>,
): Promise<Network> {
  const dbNetwork = await networkRepository.findOneBy({ name: network });
  if (!dbNetwork) {
    throw 'Not found network';
  }
  return dbNetwork;
}

export async function findContract(
  contractRepository: Repository<Contract>,
  address: string,
  networkRepository?: Repository<Network>,
  network?: DeployNetworkKey,
): Promise<Contract | null> {
  let findOption: FindOptionsWhere<Contract> = { address };
  if (network && networkRepository) {
    const dbNetwork = await findNetwork(network, networkRepository);

    findOption = {
      ...findOption,
      networkId: dbNetwork.id,
    };
  }
  return contractRepository.findOneBy(findOption);
}

export async function findContracts(
  contractRepository: Repository<Contract>,
  networkRepository: Repository<Network>,
  network?: DeployNetworkKey,
  notDisable = true,
): Promise<Contract[]> {
  const createQueryBuilder = contractRepository.createQueryBuilder(CContract);

  if (network) {
    const dbNetwork = await findNetwork(network, networkRepository);
    createQueryBuilder.andWhere(`${PContract('networkId')} = :id`, { id: dbNetwork.id });
  }

  if (notDisable) {
    createQueryBuilder.andWhere(`${PContract('disable')} IS NOT TRUE`);
  }

  return createQueryBuilder.getMany();
}
