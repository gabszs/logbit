import { BaseService } from "../../common/services/baseService";
import type { DocumentRepository } from "./repository";

export class DocumentService extends BaseService {
	declare repository: DocumentRepository;
}
